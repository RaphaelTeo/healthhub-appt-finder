# HealthHub slot finder

Lists the open polyclinic appointment slots on [HealthHub](https://eservices.healthhub.sg/appointments/make-new/book-polyclinic) for the appointment types, polyclinics and months you choose, so you don't have to click through every polyclinic and date yourself.

It only looks. It never selects a slot, and never books, changes or cancels anything.

Unofficial: not affiliated with HealthHub or the Ministry of Health, and it may stop working whenever HealthHub changes its booking page.

There are two ways to use it:

- **[The bookmark](#the-bookmark)**, built at <https://raphaelteo.github.io/healthhub-appt-finder/>. Nothing to install.
- **[The Python script](#the-python-script)**, which opens a Chrome window and runs the same search there, with the options kept in a file.

The bookmark is the preferred way: it is the more thoroughly developed and tested of the two.

## The bookmark

1. Open <https://raphaelteo.github.io/healthhub-appt-finder/> and tick the appointment types, polyclinics and months. The map shows where each polyclinic is; hover over a pin for its address and opening hours.
2. Save the “HealthHub slots” button as a bookmark, in any of these ways:
   - drag it onto your bookmarks bar;
   - click “copy its code”, add a new bookmark and paste the code as its address;
   - in Firefox or Safari, right-click it and choose “Bookmark Link…” (Firefox) or “Add Link to Bookmarks…” (Safari). Chrome and Edge have no such menu item.
3. Open [HealthHub's polyclinic booking page](https://eservices.healthhub.sg/appointments/make-new/book-polyclinic) and log in with Singpass.
4. Click the bookmark. A panel appears over the page and shows the search as it goes. Keep that tab open and in front until it finishes: the search stalls in a background tab.
5. The open slots are then shown in a new tab. If your browser blocks it, click “Open results” in the panel.

Good to know:

- After the first three slot searches the panel says about when it will be done, and the browser console gets `Estimated time: [x] minutes, come back at [y]`. It is a rough figure that assumes the rest of the search goes at the pace of the start.
- If the booking form has not shown up within a minute, usually because you are not logged in, the panel stops and asks you to log in with Singpass and click the bookmark again.
- Some appointments ask a question before showing slots, for example Doctor Consultation asking about symptoms. The panel then hands the page to you for up to 3 minutes, and skips that polyclinic if the question is left unanswered.
- “Doctor Consult for General Conditions (SingHealth Polyclinics)” cannot be searched: HealthHub offers no location or date to choose before its “Next” button, which this tool never presses.
- Months are counted from the day you use the bookmark, so one bookmark keeps working in the months to come. To change its options, change them on the page and save the button again.
- It runs entirely in your browser. The bookmark carries all of its own code and sends nothing anywhere; the slots it finds travel to the results page inside the link itself.

## The Python script

Needs Python 3.10 or later and Google Chrome.

```
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python healthhub_appt_finder.py
```

Set the appointment types, the polyclinics and the months to search in [config.yaml](config.yaml), which lists the choices. They are the same options as on the website: one or more appointment types, any polyclinics or all of them, and any months. Pass `--config` to use another file.

The script opens a Chrome window on HealthHub's booking page. Scan the Singpass QR code there within a minute; if you don't, the script stops and you run it again. It then runs the bookmark's search in that window, so everything under [The bookmark](#the-bookmark) applies: the panel shows the search as it goes, and the open slots are shown in a new tab. The terminal gets the `Estimated time: [x] minutes, come back at [y]` line and, at the end, the same list of slots.

The Chrome window stays open afterwards, still logged in, so you can go on to book. The script ends when you close it.

## Feedback

If this tool helped you, I would appreciate it if you just click submit on [this form](https://forms.gle/4JW96S9wJqR1uezdA) to show it. Any comments or feedback are optional! The results page links to the same form.

## How it works

The search is the bookmark's code, `docs/finder.js`, whichever way you start it. It works the booking form the way a person would: it picks the appointment type and the polyclinic, picks a date, and reads the slots HealthHub answers with.

Picking a date makes HealthHub answer with the closest slots on or after it, so most dates never need a search of their own. After an answer the next date searched is the last date it returned; after an empty answer, 7 days later.

## What is in here

| Path | What it is |
| --- | --- |
| `docs/` | The GitHub Pages site, served as it is with no build step. |
| `docs/finder.js` | The search itself. `docs/app.js` bakes the chosen options into it to make the bookmark. |
| `docs/options.js` | The appointment types and the polyclinics offering each, as HealthHub listed them on 12 Oct 2026. |
| `docs/polyclinics.js`, `docs/sgmap.js` | The map's polyclinics and town outlines. |
| `docs/results.html` | The page the results are shown on, with the link to the feedback form. |
| `healthhub_appt_finder.py`, `config.yaml` | The Python script, which runs `docs/finder.js` in a Chrome window, and its options. |

## Map data

Addresses and opening hours are as published on the NHG Polyclinics, SingHealth Polyclinics and National University Polyclinics websites on 12 Oct 2026. Positions come from OneMap. The town outlines contain information from URA's Master Plan 2019 Planning Area Boundary (No Sea), accessed on 12 Oct 2026 from data.gov.sg, which is made available under the terms of the [Singapore Open Data Licence version 1.0](https://data.gov.sg/open-data-licence).
