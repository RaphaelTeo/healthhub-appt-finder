"""Find available HealthHub polyclinic appointment slots.

Usage:
    .venv\\Scripts\\python.exe healthhub_appt_finder.py [--config config.yaml]

Opens a Chrome window, waits for you to log in with Singpass (QR scan), then
walks the polyclinic booking flow and prints every available slot it finds.
It only reads slots: it never selects one or presses "Next".
"""

import argparse
import calendar
import json
import math
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from itertools import groupby
from pathlib import Path
from urllib.parse import urlparse

import yaml
from playwright.sync_api import (
    Error as PlaywrightError,
    Page,
    Response,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
)

BOOKING_URL = "https://eservices.healthhub.sg/appointments/make-new/book-polyclinic"
HEALTHHUB_HOST = "eservices.healthhub.sg"
SLOTS_API_PATH = "/appointments/slots"

LOGIN_TIMEOUT_SECONDS = 60
MANUAL_STEP_TIMEOUT_SECONDS = 180
ACTION_TIMEOUT_MS = 45_000

# Picking a date makes the site answer with the *closest* slots on or after it,
# so dates before the returned slots never need their own query. An empty
# answer has been seen to cover at least the following 14 days; after one we
# move on by this many days. Set to 1 to query every single date.
EMPTY_RESULT_STEP_DAYS = 7
MAX_SLOT_PAGES = 50
# How many slot searches to time before saying when the rest will be done.
ESTIMATE_AFTER_SEARCHES = 3

DEFAULT_CONFIG = {
    "appointment_type": "Dental Cleaning (Scaling & Polishing)",
    "locations": ["Serangoon Polyclinic"],
    "months_out": 2,
}


class SlotsApiError(Exception):
    pass


@dataclass(frozen=True, order=True)
class Slot:
    location: str
    start: datetime


def load_config(path: Path) -> dict:
    config = dict(DEFAULT_CONFIG)
    if path.exists():
        config.update(yaml.safe_load(path.read_text(encoding="utf-8")) or {})
    locations = config["locations"] or []
    config["locations"] = [locations] if isinstance(locations, str) else list(locations)
    config["months_out"] = int(config["months_out"])
    if config["months_out"] < 0:
        sys.exit("config: months_out must be 0 or more")
    return config


def search_window(months_out: int, today: date | None = None) -> tuple[date, date]:
    """Today through the last day of the month `months_out` months from now."""
    today = today or date.today()
    month_index = today.month - 1 + months_out
    year, month = today.year + month_index // 12, month_index % 12 + 1
    return today, date(year, month, calendar.monthrange(year, month)[1])


def normalise(text: str) -> str:
    return " ".join(text.split()).casefold()


def find_option(options: list[str], wanted: str) -> str | None:
    return next((option for option in options if normalise(option) == normalise(wanted)), None)


def bullet_list(options: list[str]) -> str:
    return "\n".join(f"  - {option}" for option in options)


# --- login -------------------------------------------------------------------

def on_healthhub(page: Page) -> bool:
    url = urlparse(page.url)
    return url.hostname == HEALTHHUB_HOST and not url.path.startswith("/callback")


def is_booking_page(url: str) -> bool:
    return urlparse(url).path.rstrip("/") == urlparse(BOOKING_URL).path


def booking_form_visible(page: Page) -> bool:
    try:
        return page.get_by_test_id("selection-component").first.is_visible()
    except PlaywrightError:  # page was mid-navigation
        return False


def wait_until(page: Page, condition, timeout_seconds: float) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if condition():
            return True
        page.wait_for_timeout(250)
    return False


def logged_in(page: Page) -> bool:
    """On HealthHub with the booking form rendered (or on some other HealthHub page)."""
    return on_healthhub(page) and (not is_booking_page(page.url) or booking_form_visible(page))


def login(page: Page, timeout_seconds: int = LOGIN_TIMEOUT_SECONDS) -> None:
    """Open the booking page, waiting for a Singpass QR scan when the site asks for one."""
    page.goto(BOOKING_URL, wait_until="domcontentloaded")
    # Without a session the page bounces to Singpass from script shortly after loading.
    wait_until(page, lambda: logged_in(page) or not on_healthhub(page), 30)
    if logged_in(page):
        return

    print(f"Scan the QR code in the Chrome window with your Singpass app "
          f"(waiting up to {timeout_seconds}s)...")
    if not wait_until(page, lambda: logged_in(page), timeout_seconds):
        sys.exit(f"Not logged in with Singpass after {timeout_seconds}s. Run the tool again "
                 "and scan the QR code as soon as it shows.")
    print("Logged in.")


# --- booking form ------------------------------------------------------------

def open_picker(page: Page, label: str, picker_path: str) -> None:
    """Open the picker page behind the booking form's Service Type / Location field."""
    if picker_path in page.url:
        return
    # While slots are loading the field is only styled as disabled and swallows
    # clicks, so wait for that styling to clear rather than for `enabled`.
    field = page.locator('[data-testid="selection-component"]:not(.cursor-not-allowed)').filter(
        has=page.get_by_text(label, exact=True)
    )
    field.click()
    page.wait_for_url(f"**{picker_path}")


def select_appointment_type(page: Page, wanted: str) -> None:
    open_picker(page, "Service Type", "/select-service-type")
    cards = page.get_by_test_id("service type card")
    cards.first.wait_for()
    options = [text.strip() for text in cards.all_inner_texts()]
    match = find_option(options, wanted)
    if match is None:
        sys.exit(f"Appointment type {wanted!r} not found. Available options:\n"
                 f"{bullet_list(options)}")
    cards.nth(options.index(match)).click()
    try:
        page.wait_for_url(is_booking_page)
    except PlaywrightTimeoutError:
        sys.exit(f"Selecting {match!r} did not return to the booking form; this "
                 f"appointment type needs extra steps this tool does not automate.")


def open_location_picker(page: Page) -> list[str]:
    """Open the location picker and return the polyclinics offering the service."""
    open_picker(page, "Location", "/select-location")
    buttons = page.locator("button.location")
    buttons.first.wait_for()
    return [text.strip().splitlines()[0] for text in buttons.all_inner_texts()]


def resolve_locations(wanted: list[str], available: list[str]) -> list[str]:
    if not wanted:
        return available
    resolved = []
    for name in wanted:
        match = find_option(available, name)
        if match is None:
            print(f"! Location {name!r} is not offered for this appointment type; skipping.")
        elif match not in resolved:
            resolved.append(match)
    if len(resolved) < len(wanted):
        print(f"  Available locations:\n{bullet_list(available)}")
    if not resolved:
        sys.exit("None of the configured locations are available.")
    return resolved


# --- slots -------------------------------------------------------------------

def is_slots_response(response: Response) -> bool:
    return response.url.endswith(SLOTS_API_PATH) and response.request.method == "POST"


def select_location(page: Page, name: str) -> Response:
    """Pick a polyclinic; returns the slots response for the form's default date."""
    responses = []

    def collect(response: Response) -> None:
        if is_slots_response(response):
            responses.append(response)

    page.on("response", collect)
    try:
        page.locator("button.location").filter(has=page.get_by_text(name, exact=True)).click()
        page.wait_for_url(lambda url: "/select-location" not in url)
        # Some polyclinics show an "Important Notes" page before the slots.
        if "/before-care" in page.url:
            page.get_by_role("button", name="Continue", exact=True).click()
        if not wait_until(page, lambda: responses, 20):
            # e.g. Doctor Consultation asks about symptoms, which only you can answer.
            print("  The site is asking a question first; please answer it in the Chrome "
                  f"window (waiting up to {MANUAL_STEP_TIMEOUT_SECONDS}s)...")
            if not wait_until(page, lambda: responses, MANUAL_STEP_TIMEOUT_SECONDS):
                raise SlotsApiError("no slots were shown; the site's question was not answered")
    finally:
        page.remove_listener("response", collect)
    return responses[0]


def pick_date(page: Page, day: date) -> Response | None:
    """Pick `day` in the Appointment Date calendar; None if the site won't allow it."""
    date_input = page.locator(".ant-picker input")
    if not date_input.count():
        return None
    date_input.click()
    panel = page.locator(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)")
    panel.wait_for()
    shown = datetime.strptime(
        f"{panel.locator('.ant-picker-month-btn').inner_text()} "
        f"{panel.locator('.ant-picker-year-btn').inner_text()}", "%b %Y")
    months_ahead = (day.year - shown.year) * 12 + day.month - shown.month
    step = panel.locator(".ant-picker-header-next-btn" if months_ahead > 0
                         else ".ant-picker-header-prev-btn")
    for _ in range(abs(months_ahead)):
        step.click()
    cell = panel.locator(f'td.ant-picker-cell-in-view[title="{day.isoformat()}"]')
    if not cell.count() or "ant-picker-cell-disabled" in (cell.get_attribute("class") or ""):
        page.keyboard.press("Escape")
        return None
    with page.expect_response(is_slots_response) as response_info:
        cell.click()
    return response_info.value


def slots_result(response: Response) -> dict:
    if not response.ok:
        raise SlotsApiError(f"slots request failed with HTTP {response.status}")
    body = response.json()
    if body.get("Status") != "S":
        raise SlotsApiError(body.get("Message") or f"slots request failed: {body.get('Code')}")
    return body.get("Result") or {}


def queried_date(response: Response) -> date:
    """The Appointment Date a slots response was requested for."""
    return date.fromisoformat(json.loads(response.request.post_data)["Start"])


def read_slots(page: Page, response: Response, location: str, end: date) -> tuple[date, list[Slot]]:
    """The date a slots response was queried from and its slots, earliest first.

    Long answers come 25 at a time; "Load more" is followed until they pass `end`.
    """
    queried_from = queried_date(response)
    load_more = page.get_by_role("button", name=re.compile("load more", re.IGNORECASE))
    slots = []
    for _ in range(MAX_SLOT_PAGES):
        result = slots_result(response)
        slots += [Slot(location, datetime.fromisoformat(slot["Start"]))
                  for slot in result.get("Slots") or []]
        next_page = (result.get("Link") or "").partition("nextPageRequestData=")[2]
        if not next_page or (slots and max(slots).start.date() > end):
            break
        try:
            load_more.wait_for(timeout=5_000)
            with page.expect_response(is_slots_response, timeout=15_000) as response_info:
                load_more.click()
        except PlaywrightTimeoutError:
            break
        response = response_info.value
    return queried_from, slots


class Estimate:
    """Prints, once, when the search should be done, going by its first few slot searches."""

    def __init__(self) -> None:
        self.started = time.monotonic()
        self.searches = 0
        self.printed = False

    def searched(self, fraction: float) -> None:
        """Note one more slot search, after which `fraction` of the whole search is done."""
        self.searches += 1
        if self.printed or self.searches < ESTIMATE_AFTER_SEARCHES or fraction >= 1:
            return
        self.printed = True
        # Assumes the rest goes at the pace of the part done so far.
        remaining = (time.monotonic() - self.started) * (1 - fraction) / fraction
        minutes = max(1, math.ceil(remaining / 60))
        print(f"Estimated time: {minutes} minute{'s' if minutes > 1 else ''}, "
              f"come back at {datetime.now() + timedelta(minutes=minutes):%I:%M %p}")


def scan_location(page: Page, location: str, start: date, end: date, searched) -> list[Slot]:
    """All slots at `location` between `start` and `end`, walking the date picker.

    searched(fraction of the dates covered) is called after each slot search.
    """
    found = set()
    response = select_location(page, location)
    if queried_date(response) > start:
        # The form can restore a later date from an earlier search; rewind if allowed.
        response = pick_date(page, start) or response
    while response is not None:
        queried_from, slots = read_slots(page, response, location, end)
        found.update(slot for slot in slots if start <= slot.start.date() <= end)
        slot_dates = sorted({slot.start.date() for slot in slots})
        print(f"  from {queried_from:%d %b %Y}: " + (
            f"{len(slots)} slot(s), {slot_dates[0]:%d %b %Y} to {slot_dates[-1]:%d %b %Y}"
            if slots else "no slots"))

        if not slots:
            next_day = queried_from + timedelta(days=EMPTY_RESULT_STEP_DAYS)
        elif slot_dates[-1] > queried_from:
            # Everything before the last returned date is accounted for; query
            # that date itself in case the answer stopped part-way through it.
            next_day = slot_dates[-1]
        else:
            next_day = queried_from + timedelta(days=1)
        searched(min(1, (next_day - start).days / ((end - start).days + 1)))
        if next_day > end:
            break
        response = pick_date(page, next_day)
        if response is None:
            print(f"  {next_day:%d %b %Y} is not selectable on the site; stopping here.")
    return sorted(found)


def find_slots(page: Page, config: dict, start: date, end: date) -> list[Slot]:
    if not is_booking_page(page.url):
        page.goto(BOOKING_URL)
    select_appointment_type(page, config["appointment_type"])
    locations = resolve_locations(config["locations"], open_location_picker(page))

    slots = []
    needs_reset = False
    estimate = Estimate()
    for index, location in enumerate(locations):
        print(f"\n{location}")
        try:
            if needs_reset:
                page.goto(BOOKING_URL)
                select_appointment_type(page, config["appointment_type"])
                needs_reset = False
            open_location_picker(page)
            slots += scan_location(page, location, start, end, lambda fraction: estimate.searched(
                (index + fraction) / len(locations)))
        except (PlaywrightError, SlotsApiError) as error:
            print(f"  ! skipped: {str(error).splitlines()[0]}")
            if urlparse(page.url).hostname != HEALTHHUB_HOST:
                print("! Session ended (redirected away from HealthHub); stopping.")
                break
            needs_reset = True
    return slots


def print_slots(slots: list[Slot]) -> None:
    if not slots:
        print("\nNo available slots found.")
        return
    print(f"\nAvailable slots ({len(slots)}):")
    for location, location_slots in groupby(sorted(slots), key=lambda slot: slot.location):
        print(f"\n  {location}")
        for day, day_slots in groupby(location_slots, key=lambda slot: slot.start.date()):
            times = ", ".join(f"{slot.start:%I:%M %p}" for slot in day_slots)
            print(f"    {day:%a %d %b %Y}: {times}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", type=Path, default=Path(__file__).parent / "config.yaml")
    args = parser.parse_args()

    config = load_config(args.config)
    start, end = search_window(config["months_out"])
    print(f"Appointment type: {config['appointment_type']}")
    print(f"Locations:        {', '.join(config['locations']) or '(all)'}")
    print(f"Date range:       {start:%d %b %Y} to {end:%d %b %Y}")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=False)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(ACTION_TIMEOUT_MS)
        try:
            login(page)
            slots = find_slots(page, config, start, end)
        finally:
            browser.close()
    print_slots(slots)


if __name__ == "__main__":
    main()
