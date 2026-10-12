// The results page: shows what the bookmarklet (finder.js) found. The results
// arrive as JSON in the URL fragment:
// {at, ranges: [[first day, last day]], stopped?, types: [{name, note?,
//   locations: [{name, note?, days: {"YYYY-MM-DD": "HHMMHHMM…"}}]}]}

const BOOKING_URL = 'https://eservices.healthhub.sg/appointments/make-new/book-polyclinic';

function el(tag, properties, ...children) {
  const element = Object.assign(document.createElement(tag), properties);
  element.append(...children);
  return element;
}

const formatDay = (day, withYear = true) => new Date(day.slice(0, 10)).toLocaleDateString('en-GB',
  {weekday: 'short', day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC'});
const formatTime = (time) => `${time.slice(0, 2) % 12 || 12}:${time.slice(-2)} ${time.slice(0, 2) < 12 ? 'AM' : 'PM'}`;
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// A polyclinic's days as [[day, [HHMM, …]], …], earliest first.
const daysOf = (location) => Object.entries(location.days).sort().map(([day, times]) => [day, times.match(/.{4}/g)]);
const slotCount = (location) => daysOf(location).reduce((sum, [, times]) => sum + times.length, 0);
const earliest = (location) => daysOf(location)[0][0] + daysOf(location)[0][1][0];

function clinic(location) {
  return el('div', {className: 'clinic'},
    el('h3', {textContent: location.name}, el('span', {textContent: [plural(slotCount(location), 'slot'), location.note].filter(Boolean).join(' · ')})),
    ...daysOf(location).map(([day, times]) => el('div', {className: 'day'},
      el('time', {dateTime: day, textContent: formatDay(day)}),
      el('div', {className: 'times'}, ...times.map((time) => el('span', {textContent: formatTime(time)}))))));
}

function typeCard(type) {
  // Polyclinics with slots, the one with the earliest slot first.
  const open = type.locations.filter(slotCount).sort((a, b) => earliest(a).localeCompare(earliest(b)));
  const empty = type.locations.filter((location) => !slotCount(location) && !location.note);
  const unchecked = type.locations.filter((location) => !slotCount(location) && location.note);
  const card = el('section', {className: 'card'}, el('h2', {textContent: type.name}));
  if (type.note) {
    card.append(el('p', {className: 'hint', textContent: `Could not be searched: ${type.note}.`}));
  } else if (open.length) {
    const [day, times] = daysOf(open[0])[0];
    card.append(el('p', {className: 'hint', textContent: `${plural(open.reduce((sum, location) => sum + slotCount(location), 0), 'slot')} `
      + `at ${plural(open.length, 'polyclinic')}. Earliest: ${formatDay(day, false)}, ${formatTime(times[0])} at ${open[0].name}.`}));
  } else {
    card.append(el('p', {className: 'hint', textContent: 'No open slots found.'}));
  }
  card.append(...open.map(clinic));
  if (empty.length) card.append(el('p', {className: 'rest', textContent: `No slots: ${empty.map((location) => location.name).join(', ')}.`}));
  if (unchecked.length) {
    card.append(el('p', {className: 'rest', textContent: `Not searched: ${unchecked.map((location) => `${location.name} (${location.note})`).join('; ')}.`}));
  }
  return card;
}

function show(results) {
  const ranges = results.ranges.map(([first, last]) => `${formatDay(first)} to ${formatDay(last)}`).join(', and ');
  document.getElementById('searched').append(
    `Searched ${ranges}, as of ${formatDay(results.at)} at ${formatTime(results.at.slice(11).replace(':', ''))}. Slots go quickly: `,
    el('a', {href: BOOKING_URL, target: '_blank', rel: 'noopener', textContent: 'book on HealthHub'}), '.');
  const container = document.getElementById('results');
  if (results.stopped) {
    container.append(el('p', {className: 'notice', textContent: 'This search did not run to the end, so the list below is incomplete.'}));
  }
  container.append(...results.types.map(typeCard));
}

let results = null;
try {
  results = JSON.parse(decodeURIComponent(location.hash.slice(1)));
} catch {}
if (results && results.types) {
  show(results);
} else {
  document.getElementById('searched').append('Nothing to show yet. ',
    el('a', {href: './', textContent: 'Make your bookmark'}), ', run it on HealthHub, and the slots it finds are listed here.');
}
