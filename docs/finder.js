// The bookmarklet. app.js turns this function's source into a javascript: URL
// with the chosen options baked in, so everything it uses has to live inside
// it: HealthHub's content security policy blocks scripts loaded from elsewhere.
//
// It runs in the logged-in HealthHub tab, works the polyclinic booking form the
// way a person would and reads the slots the site answers with. It only reads
// slots: it never selects one or presses "Next".
//
// config: {types: [name], locations: [name] (empty = every polyclinic offering
// the type), months: [offset from the current month], resultsUrl}
function healthhubSlotFinder(config) {
  const HOST = 'eservices.healthhub.sg';
  const BOOKING_PATH = '/appointments/make-new/book-polyclinic';
  const SLOTS_API_PATH = '/appointments/slots';
  const PANEL_ID = 'healthhub-slot-finder';

  const ACTION_TIMEOUT_MS = 45000;
  const MANUAL_STEP_TIMEOUT_MS = 180000;
  const POLL_MS = 250;
  // Picking a date makes the site answer with the *closest* slots on or after it,
  // so dates before the returned slots never need their own query. An empty
  // answer has been seen to cover at least the following 14 days; after one we
  // move on by this many days. Set to 1 to query every single date.
  const EMPTY_RESULT_STEP_DAYS = 7;
  const MAX_SLOT_PAGES = 50;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const KEEP_TAB_OPEN = 'Keep this tab open and in front until the search finishes. '
    + 'Switching tabs or minimising the window stalls it.';

  if (location.hostname !== HOST) {
    if (confirm('This bookmark runs on the HealthHub appointment booking page.\n\n'
      + 'Open that page now? Log in with Singpass there, then click this bookmark again.')) {
      location.href = `https://${HOST}${BOOKING_PATH}`;
    }
    return;
  }
  // Clicking the bookmark again starts over, unless a search is still running.
  const oldPanel = document.getElementById(PANEL_ID);
  if (oldPanel && !oldPanel.dataset.finished) return;
  if (oldPanel) oldPanel.remove();

  class Stopped extends Error {}
  let stopped = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Counts polls instead of reading the clock: a background tab has its timers
  // slowed down, and this way the timeouts stretch along with them.
  async function waitFor(check, timeoutMs = ACTION_TIMEOUT_MS) {
    for (let waited = 0; ; waited += POLL_MS) {
      if (stopped) throw new Stopped();
      const value = check();
      if (value || waited >= timeoutMs) return value || null;
      await sleep(POLL_MS);
    }
  }

  async function need(check, what, timeoutMs) {
    const value = await waitFor(check, timeoutMs);
    if (!value) throw new Error(`timed out waiting for ${what}`);
    return value;
  }

  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const some = (selector) => () => (all(selector).length ? all(selector) : null);
  const textOf = (element) => element.innerText.trim();
  const normalise = (text) => text.split(/\s+/).join(' ').trim().toLowerCase();
  const findOption = (options, wanted) => options.find((option) => normalise(option) === normalise(wanted));

  // Days are "YYYY-MM-DD" strings and slots "YYYY-MM-DDTHH:MM", in Singapore time.
  const singaporeNow = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 16);
  const addDays = (day, days) => new Date(Date.parse(day) + days * 864e5).toISOString().slice(0, 10);
  const daysBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / 864e5;
  const formatDay = (day, withYear = true) => new Date(day.slice(0, 10)).toLocaleDateString('en-GB',
    {weekday: 'short', day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC'});
  const formatTime = (slot) => `${slot.slice(11, 13) % 12 || 12}:${slot.slice(14, 16)} ${slot.slice(11, 13) < 12 ? 'AM' : 'PM'}`;

  // The selected months as [first day, last day] ranges, starting no earlier than today.
  function searchRanges(monthOffsets, today) {
    const [year, month] = today.split('-').map(Number);
    const isoDay = (...date) => new Date(Date.UTC(...date)).toISOString().slice(0, 10);
    const ranges = [];
    let previous = null;
    for (const offset of [...new Set(monthOffsets)].sort((a, b) => a - b)) {
      const first = isoDay(year, month - 1 + offset, 1);
      const last = isoDay(year, month + offset, 0);
      if (offset - 1 === previous) ranges[ranges.length - 1][1] = last;
      else ranges.push([first < today ? today : first, last]);
      previous = offset;
    }
    return ranges;
  }

  const ranges = searchRanges(config.months, singaporeNow().slice(0, 10));
  const totalDays = ranges.reduce((sum, [start, end]) => sum + daysBetween(start, end) + 1, 0);
  const report = [];

  // --- panel -------------------------------------------------------------------

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; }
    [hidden] { display: none !important; }
    .shield { position: fixed; inset: 0; z-index: 2147483646; background: rgba(15, 23, 42, .4); }
    .panel { position: fixed; top: 16px; right: 16px; z-index: 2147483647; display: flex;
      flex-direction: column; width: 380px; max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px); overflow: hidden; border-radius: 14px; background: #fff;
      color: #0f172a; box-shadow: 0 24px 60px rgba(15, 23, 42, .4);
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    header { padding: 16px 18px 12px; }
    h1 { font-size: 16px; font-weight: 650; }
    .reminder { margin-top: 10px; padding: 8px 10px; border-radius: 8px; background: #fef3c7;
      color: #78350f; font-weight: 600; }
    .reminder.help { background: #fee2e2; color: #7f1d1d; }
    .reminder.done { background: #dcfce7; color: #14532d; }
    .track { height: 6px; margin-top: 12px; border-radius: 3px; background: #e2e8f0; overflow: hidden; }
    .bar { width: 0; height: 100%; background: #0d9488; transition: width .3s; }
    .activity { min-height: 19px; margin-top: 8px; color: #475569; font-size: 13px; }
    .list { flex: 1; overflow-y: auto; padding: 0 18px 12px; border-top: 1px solid #e2e8f0; }
    h2 { margin-top: 12px; font-size: 13px; font-weight: 650; }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0;
      border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .row span:first-child { flex: none; }
    .row span:last-child { color: #64748b; text-align: right; }
    .row.found span:last-child { color: #0f766e; font-weight: 600; }
    .row.problem span:last-child, h2 + .problem { color: #b45309; font-size: 13px; }
    footer { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid #e2e8f0; }
    button, a { padding: 7px 14px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;
      color: #0f172a; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
    a { border-color: #0d9488; background: #0d9488; color: #fff; }
  `;

  function el(tag, properties, ...children) {
    const element = Object.assign(document.createElement(tag), properties);
    element.append(...children);
    return element;
  }

  const title = el('h1', {textContent: 'Searching for appointment slots…'});
  const reminder = el('p', {className: 'reminder', textContent: KEEP_TAB_OPEN});
  const bar = el('div', {className: 'bar'});
  const activity = el('p', {className: 'activity'});
  const list = el('div', {className: 'list'});
  // Keeps stray clicks off the form while it is being worked.
  const shield = el('div', {className: 'shield'});
  const stopButton = el('button', {textContent: 'Stop'});
  const resultsLink = el('a', {textContent: 'Open results', target: '_blank', rel: 'noopener', hidden: true});
  const closeButton = el('button', {textContent: 'Close', hidden: true});
  const host = el('div', {id: PANEL_ID});
  host.attachShadow({mode: 'open'}).append(
    el('style', {textContent: CSS}),
    shield,
    el('section', {className: 'panel'},
      el('header', {}, title, reminder, el('div', {className: 'track'}, bar), activity),
      list,
      el('footer', {}, stopButton, resultsLink, closeButton)));
  document.body.append(host);
  stopButton.onclick = () => {
    stopped = true;
    stopButton.textContent = 'Stopping…';
  };
  closeButton.onclick = () => host.remove();

  function showProgress(fraction, text) {
    bar.style.width = `${Math.round(fraction * 100)}%`;
    activity.textContent = text;
  }

  // Hands the page over to the user for a question only they can answer.
  function askForHelp(asking) {
    shield.hidden = list.hidden = asking;
    reminder.className = asking ? 'reminder help' : 'reminder';
    reminder.textContent = asking
      ? 'HealthHub is asking a question first. Please answer it on the page; the search carries on by itself afterwards.'
      : KEEP_TAB_OPEN;
  }

  function addRow(name) {
    const detail = el('span', {textContent: 'checking…'});
    const row = el('div', {className: 'row'}, el('span', {textContent: name}), detail);
    list.append(row);
    row.scrollIntoView({block: 'nearest'});
    return (entry) => {
      const count = entry.slots.length;
      detail.textContent = [
        count && `${count} slot${count > 1 ? 's' : ''}, earliest ${formatDay(entry.slots[0], false)}, ${formatTime(entry.slots[0])}`,
        entry.note,
      ].filter(Boolean).join(' · ') || 'no slots';
      row.className = `row ${count ? 'found' : entry.note ? 'problem' : ''}`;
    };
  }

  // --- slots answers -----------------------------------------------------------

  // The page fetches slots over XHR; listen in on its answers.
  const answers = [];
  const xhr = XMLHttpRequest.prototype;
  const {open: xhrOpen, send: xhrSend} = xhr;
  xhr.open = function (method, url) {
    this.slotFinderWatch = /^post$/i.test(method) && String(url).split('?')[0].endsWith(SLOTS_API_PATH);
    return xhrOpen.apply(this, arguments);
  };
  xhr.send = function (requestBody) {
    if (this.slotFinderWatch) {
      this.addEventListener('loadend', () => {
        const answer = {status: this.status};
        try {
          // The Appointment Date the slots were requested for.
          answer.start = JSON.parse(requestBody).Start;
          answer.body = JSON.parse(this.responseText);
        } catch {}
        answers.push(answer);
      });
    }
    return xhrSend.apply(this, arguments);
  };

  function slotsResult(answer) {
    if (answer.status < 200 || answer.status > 299) throw new Error(`slots request failed with HTTP ${answer.status}`);
    if (!answer.body || answer.body.Status !== 'S') throw new Error((answer.body && answer.body.Message) || 'slots request failed');
    return answer.body.Result || {};
  }

  // --- booking form ------------------------------------------------------------

  const onBookingForm = () => location.pathname.replace(/\/$/, '') === BOOKING_PATH;

  async function goToBookingForm() {
    if (!onBookingForm()) {
      // A client-side navigation: loading the URL instead would end this script.
      history.pushState(null, '', BOOKING_PATH);
      dispatchEvent(new PopStateEvent('popstate'));
    }
    await need(() => onBookingForm() && document.querySelector('[data-testid="selection-component"]'),
      'the booking form (are you logged in to HealthHub?)');
  }

  // Opens the picker page behind the booking form's Service Type / Location field.
  async function openPicker(label, pickerPath) {
    if (location.pathname.includes(pickerPath)) return;
    // While slots are loading the field is only styled as disabled and swallows
    // clicks, so wait for that styling to clear.
    const field = await need(() => all('[data-testid="selection-component"]:not(.cursor-not-allowed)')
      .find((candidate) => all('*', candidate).some((node) => !node.childElementCount && node.textContent.trim() === label)),
    `the ${label} field`);
    field.click();
    await need(() => location.pathname.includes(pickerPath), `the ${label} list`);
  }

  async function selectType(wanted) {
    await openPicker('Service Type', '/select-service-type');
    const cards = await need(some('[data-testid="service type card"]'), 'the appointment types');
    const card = cards.find((candidate) => normalise(textOf(candidate)) === normalise(wanted));
    if (!card) throw new Error('HealthHub does not list this appointment type');
    card.click();
    if (!(await waitFor(onBookingForm, 15000))) {
      throw new Error('this appointment type needs extra steps this tool does not automate');
    }
  }

  // Opens the location picker; returns the buttons of the polyclinics offering the service, by name.
  async function locationButtons() {
    await openPicker('Location', '/select-location');
    const buttons = await need(some('button.location'), 'the polyclinics');
    return new Map(buttons.map((button) => [textOf(button).split('\n')[0].trim(), button]));
  }

  // Picks a polyclinic; returns the slots answer for the form's default date.
  async function selectLocation(button) {
    const mark = answers.length;
    button.click();
    await need(() => !location.pathname.includes('/select-location'), 'the polyclinic to be selected');
    // Some polyclinics show an "Important Notes" page before the slots.
    if (location.pathname.includes('/before-care')) {
      (await need(() => all('button').find((candidate) => textOf(candidate) === 'Continue'), 'the Continue button')).click();
    }
    let answer = await waitFor(() => answers[mark], 20000);
    if (!answer) {
      // e.g. Doctor Consultation asks about symptoms, which only the user can answer.
      askForHelp(true);
      try {
        answer = await waitFor(() => answers[mark], MANUAL_STEP_TIMEOUT_MS);
      } finally {
        askForHelp(false);
      }
      if (!answer) throw new Error("no slots were shown; the site's question was not answered");
    }
    return answer;
  }

  // Picks `day` in the Appointment Date calendar; null if the site won't allow it.
  async function pickDate(day) {
    if (!document.querySelector('.ant-picker input')) return null;
    const input = await need(() => document.querySelector('.ant-picker input:not(:disabled)'), 'the date field');
    input.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
    const calendar = await need(() => document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)'), 'the calendar');
    const shownMonth = () => MONTHS.indexOf(textOf(calendar.querySelector('.ant-picker-month-btn')))
      + 12 * Number(textOf(calendar.querySelector('.ant-picker-year-btn')));
    const wantedMonth = Number(day.slice(5, 7)) - 1 + 12 * Number(day.slice(0, 4));
    for (let shown = shownMonth(); shown !== wantedMonth; shown = shownMonth()) {
      calendar.querySelector(shown < wantedMonth ? '.ant-picker-header-next-btn' : '.ant-picker-header-prev-btn').click();
      if (!(await waitFor(() => shownMonth() !== shown, 5000))) break;
    }
    const cell = calendar.querySelector(`td.ant-picker-cell-in-view[title="${day}"]`);
    if (!cell || cell.classList.contains('ant-picker-cell-disabled')) {
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', keyCode: 27, which: 27, bubbles: true}));
      return null;
    }
    const mark = answers.length;
    cell.click();
    return need(() => answers.slice(mark).find((answer) => answer.start === day), `the slots from ${formatDay(day)}`);
  }

  // An answer's slots, earliest first. Long answers come 25 at a time; "Load
  // more" is followed until they pass `end`.
  async function readSlots(answer, end) {
    const slots = [];
    for (let page = 0; page < MAX_SLOT_PAGES; page++) {
      const result = slotsResult(answer);
      slots.push(...(result.Slots || []).map((slot) => slot.Start.slice(0, 16)));
      slots.sort();
      const nextPage = (result.Link || '').split('nextPageRequestData=')[1];
      if (!nextPage || (slots.length && slots.at(-1).slice(0, 10) > end)) break;
      const loadMore = await waitFor(() => all('button').find((button) => /load more/i.test(textOf(button))), 5000);
      if (!loadMore) break;
      const mark = answers.length;
      loadMore.click();
      answer = await waitFor(() => answers[mark], 15000);
      if (!answer) break;
    }
    return slots;
  }

  // Collects a polyclinic's slots within `ranges` into entry.slots, walking the
  // date picker. onDay(day, fraction of the days covered) is called before each query.
  async function scanLocation(button, entry, onDay) {
    const found = new Set();
    let daysDone = 0;
    let answer = await selectLocation(button);
    const cannotPick = (day) => {
      // Without a calendar the site has already shown all it offers (e.g. same-day Doctor Consultation).
      if (document.querySelector('.ant-picker input')) entry.note = `${formatDay(day)} cannot be picked on the site; stopped there`;
    };
    for (const [start, end] of ranges) {
      if (answer.start !== start) {
        // The form opens on today, or on a date restored from an earlier search.
        onDay(start, daysDone / totalDays);
        const picked = await pickDate(start);
        if (picked) {
          answer = picked;
        } else if (!(start < answer.start && answer.start <= end)) {
          cannotPick(start);
          return;
        }
      }
      for (;;) {
        const queriedFrom = answer.start;
        const slots = await readSlots(answer, end);
        slots.filter((slot) => start <= slot.slice(0, 10) && slot.slice(0, 10) <= end).forEach((slot) => found.add(slot));
        entry.slots = [...found].sort();

        const lastDay = slots.length ? slots.at(-1).slice(0, 10) : null;
        let nextDay;
        if (!lastDay) {
          nextDay = addDays(queriedFrom, EMPTY_RESULT_STEP_DAYS);
        } else if (lastDay > queriedFrom) {
          // Everything before the last returned date is accounted for; query
          // that date itself in case the answer stopped part-way through it.
          nextDay = lastDay;
        } else {
          nextDay = addDays(queriedFrom, 1);
        }
        if (nextDay > end) break;
        onDay(nextDay, (daysDone + daysBetween(start, nextDay)) / totalDays);
        answer = await pickDate(nextDay);
        if (!answer) {
          cannotPick(nextDay);
          return;
        }
      }
      daysDone += daysBetween(start, end) + 1;
    }
  }

  async function scanType(type, typeIndex) {
    await goToBookingForm();
    await selectType(type.name);
    const offered = [...(await locationButtons()).keys()];
    const wanted = config.locations.length ? config.locations : offered;
    let needsReset = false;
    for (const [index, wantedName] of wanted.entries()) {
      const entry = {name: findOption(offered, wantedName) || wantedName, slots: []};
      type.locations.push(entry);
      const showResult = addRow(entry.name);
      const progress = (fraction) => (typeIndex + (index + fraction) / wanted.length) / config.types.length;
      showProgress(progress(0), `${entry.name}: opening…`);
      try {
        if (!offered.includes(entry.name)) throw new Error('not offered for this appointment type');
        if (needsReset) {
          await goToBookingForm();
          await selectType(type.name);
          needsReset = false;
        }
        const button = (await locationButtons()).get(entry.name);
        await scanLocation(button, entry, (day, fraction) => showProgress(
          progress(fraction), `${entry.name}: checking from ${formatDay(day)}`));
      } catch (error) {
        entry.note = error instanceof Stopped ? 'stopped before it finished' : error.message;
        if (error instanceof Stopped) throw error;
        needsReset = offered.includes(entry.name);
      } finally {
        showResult(entry);
      }
    }
  }

  async function run() {
    await goToBookingForm();
    for (const [typeIndex, name] of config.types.entries()) {
      const type = {name, locations: []};
      report.push(type);
      list.append(el('h2', {textContent: name}));
      try {
        await scanType(type, typeIndex);
      } catch (error) {
        if (error instanceof Stopped) throw error;
        type.note = error.message;
        list.append(el('p', {className: 'problem', textContent: error.message}));
      }
    }
  }

  function finish(error) {
    Object.assign(xhr, {open: xhrOpen, send: xhrSend});
    host.dataset.finished = 'yes';
    const slots = report.flatMap((type) => type.locations).flatMap((entry) => entry.slots);
    const summary = `${slots.length || 'No'} slot${slots.length === 1 ? '' : 's'} found.`;
    if (!error) {
      title.textContent = 'Search finished';
      reminder.textContent = `${summary} You can use other tabs again.`;
      bar.style.width = '100%';
    } else if (error instanceof Stopped) {
      title.textContent = 'Search stopped';
      reminder.textContent = `${summary} The search was stopped before it finished.`;
    } else {
      title.textContent = 'Search failed';
      reminder.textContent = `Something went wrong: ${error.message}`;
    }
    reminder.className = error && !(error instanceof Stopped) ? 'reminder help' : 'reminder done';
    activity.textContent = '';
    shield.hidden = stopButton.hidden = true;
    list.hidden = resultsLink.hidden = closeButton.hidden = false;

    // Passed in the URL fragment, which the browser keeps to itself.
    resultsLink.href = `${config.resultsUrl}#${encodeURIComponent(JSON.stringify({
      at: singaporeNow(),
      ranges,
      stopped: error ? true : undefined,
      types: report.map((type) => ({
        ...type,
        locations: type.locations.map(({slots: found, ...entry}) => {
          // Each day's times as one "HHMMHHMM…" string, to keep the link short.
          const days = {};
          for (const slot of found) days[slot.slice(0, 10)] = (days[slot.slice(0, 10)] || '') + slot.slice(11, 13) + slot.slice(14, 16);
          return {...entry, days};
        }),
      })),
    }))}`;
    if (!error) {
      const tab = window.open(resultsLink.href, '_blank');
      if (tab) tab.opener = null;
      else activity.textContent = 'Your browser blocked the new tab: click "Open results".';
    }
    activity.hidden = !activity.textContent;
  }

  run().then(() => finish(), finish);
}
