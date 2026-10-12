"""Find available HealthHub polyclinic appointment slots.

Usage:
    .venv\\Scripts\\python.exe healthhub_appt_finder.py [--config config.yaml]

Opens a Chrome window, waits for you to log in with Singpass (QR scan), then
runs the website's bookmark (docs/finder.js) in that window with the options
from the config file. A panel over the page shows the search as it goes; the
open slots are then shown in a new tab and printed here.
It only reads slots: it never selects one or presses "Next".
"""

import argparse
import calendar
import json
import sys
import time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

import yaml
from playwright.sync_api import Error as PlaywrightError, Page, sync_playwright

BOOKING_URL = "https://eservices.healthhub.sg/appointments/make-new/book-polyclinic"
HEALTHHUB_HOST = "eservices.healthhub.sg"
RESULTS_URL = "https://raphaelteo.github.io/healthhub-appt-finder/results.html"
FINDER_JS = Path(__file__).parent / "docs" / "finder.js"
PANEL = "#healthhub-slot-finder"  # the bookmark's panel

LOGIN_TIMEOUT_SECONDS = 60
ACTION_TIMEOUT_MS = 45_000

DEFAULT_CONFIG = {
    "appointment_types": ["Dental Cleaning (Scaling & Polishing)"],
    "locations": ["Serangoon Polyclinic"],
    "months": [0, 1, 2],
}


def load_config(path: Path) -> dict:
    config = dict(DEFAULT_CONFIG)
    if path.exists():
        config.update(yaml.safe_load(path.read_text(encoding="utf-8")) or {})
    unknown = sorted(set(config) - set(DEFAULT_CONFIG))
    if unknown:
        sys.exit(f"config: unknown option {', '.join(unknown)}; the options are {', '.join(DEFAULT_CONFIG)}")
    # A single value may be given without the list around it.
    config = {name: value if isinstance(value, list) else [] if value is None else [value]
              for name, value in config.items()}
    if not config["appointment_types"]:
        sys.exit("config: appointment_types needs at least one appointment type")
    if not config["months"] or not all(type(month) is int and month >= 0 for month in config["months"]):
        sys.exit("config: months needs at least one month, as whole numbers counted from 0 for the current month")
    config["months"] = sorted(set(config["months"]))
    return config


def month_label(months_ahead: int, today: date) -> str:
    month_index = today.month - 1 + months_ahead
    return f"{calendar.month_abbr[month_index % 12 + 1]} {today.year + month_index // 12}"


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


# --- search ------------------------------------------------------------------

def find_slots(page: Page, config: dict) -> dict:
    """Run the bookmark in the page and wait for it to finish.

    Returns what it hands to the results page (the format is described in
    docs/results.js), plus the panel's closing "message".
    """
    def panel_finished() -> bool | None:
        """None once the panel is gone, which a page load does to it."""
        try:
            return page.evaluate("""(panel) => {
                const host = document.querySelector(panel);
                return host && Boolean(host.dataset.finished);
            }""", PANEL)
        except PlaywrightError:  # page was mid-navigation
            return None

    def relay_estimate(message) -> None:
        if message.text.startswith("Estimated time"):
            print(message.text)

    options = {"types": config["appointment_types"], "locations": config["locations"],
               "months": config["months"], "resultsUrl": RESULTS_URL}
    page.on("console", relay_estimate)
    try:
        page.evaluate(f"void ({FINDER_JS.read_text(encoding='utf-8')})({json.dumps(options)});")
        while not (finished := panel_finished()):
            if finished is None:
                sys.exit("The HealthHub page was left or reloaded before the search finished "
                         "(the session may have ended). Run the tool again.")
            page.wait_for_timeout(500)
    finally:
        page.remove_listener("console", relay_estimate)

    # The link to the results page carries the results in its fragment.
    link = page.locator(f"{PANEL} a").get_attribute("href") or ""
    results = json.loads(unquote(link.partition("#")[2])) if "#" in link else {"types": []}
    results["message"] = page.locator(f"{PANEL} .reminder").inner_text()
    return results


def print_results(results: dict) -> None:
    """The same list as the results page shows."""
    def slots_of(location: dict) -> list[datetime]:
        # Each day's times come as one "HHMMHHMM…" string.
        return sorted(datetime.strptime(day + times[at:at + 4], "%Y-%m-%d%H%M")
                      for day, times in location["days"].items() for at in range(0, len(times), 4))

    if results.get("stopped"):
        print(f"\n! The search did not run to the end, so the list below is incomplete. {results['message']}")
    for found in results["types"]:
        print(f"\n{found['name']}")
        if found.get("note"):
            print(f"  Could not be searched: {found['note']}.")
        locations = [(location, slots_of(location)) for location in found["locations"]]
        # Polyclinics with slots, the one with the earliest slot first.
        for location, slots in sorted((pair for pair in locations if pair[1]), key=lambda pair: pair[1][0]):
            note = f" · {location['note']}" if location.get("note") else ""
            print(f"\n  {location['name']} ({len(slots)} slot{'s' if len(slots) > 1 else ''}{note})")
            for day in sorted({slot.date() for slot in slots}):
                times = ", ".join(f"{slot:%I:%M %p}" for slot in slots if slot.date() == day)
                print(f"    {day:%a %d %b %Y}: {times}")
        empty = [location["name"] for location, slots in locations if not slots and not location.get("note")]
        unchecked = [f"{location['name']} ({location['note']})"
                     for location, slots in locations if not slots and location.get("note")]
        if empty:
            print(f"\n  No slots: {', '.join(empty)}.")
        if unchecked:
            print(f"\n  Not searched: {'; '.join(unchecked)}.")


def wait_for_window_to_close(page: Page) -> None:
    while page.context.pages:
        try:
            page.context.pages[0].wait_for_event("close", timeout=0)
        except PlaywrightError:  # the whole browser went at once
            break


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", type=Path, default=Path(__file__).parent / "config.yaml")
    args = parser.parse_args()

    config = load_config(args.config)
    today = date.today()
    print(f"Appointment types: {', '.join(config['appointment_types'])}")
    print(f"Locations:         {', '.join(config['locations']) or '(every polyclinic offering the type)'}")
    print(f"Months:            {', '.join(month_label(month, today) for month in config['months'])}")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=False)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(ACTION_TIMEOUT_MS)
        try:
            login(page)
            print("Searching. The panel in the Chrome window shows the progress; "
                  "keep that window open and its HealthHub tab in front.")
            print_results(find_slots(page, config))
            print("\nClose the Chrome window when you are done with it.")
            wait_for_window_to_close(page)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
