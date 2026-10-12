// The generator page: collects the options and turns healthhubSlotFinder
// (finder.js) plus those options into a bookmarklet.

const DEFAULT_TYPES = ['Dental Cleaning (Scaling & Polishing)'];
const DEFAULT_LOCATIONS = ['Serangoon Polyclinic'];
const DEFAULT_MONTHS = [0, 1, 2];
const MONTH_CHOICES = 7;
// Roughly what one polyclinic took per day of dates searched on the live site.
const SECONDS_PER_DAY_SEARCHED = 0.35;

const TYPES = APPOINTMENT_GROUPS.flatMap((group) => group.types);
// Singapore's date, readable through the UTC getters.
const today = new Date(Date.now() + 8 * 36e5);

const typeList = document.getElementById('types');
const locationList = document.getElementById('locations');
const monthList = document.getElementById('months');
const summary = document.getElementById('summary');
const bookmarklet = document.getElementById('bookmarklet');
const bookmarkHint = document.getElementById('bookmark-hint');

function el(tag, properties, ...children) {
  const element = Object.assign(document.createElement(tag), properties);
  element.append(...children);
  return element;
}

function option(className, name, value, label, checked) {
  return el('label', {className}, el('input', {type: 'checkbox', name, value, checked}), el('span', {textContent: label}));
}

const checked = (name) => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);

const monthStart = (offset) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
const monthLabel = (offset) => monthStart(offset).toLocaleDateString('en-GB', {month: 'short', year: 'numeric', timeZone: 'UTC'});

function listOf(names, many) {
  if (names.length > 3) return `${names.length} ${many}`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

// Polyclinics offering any of the ticked appointment types, keeping `selected` ticked.
function showLocations(selected) {
  const types = checked('type');
  const offered = [...new Set(TYPES.filter((type) => types.includes(type.name)).flatMap((type) => type.locations))].sort();
  locationList.replaceChildren(...offered.map((name) => option('option', 'location', name, name, selected.includes(name))));
}

function bookmarkletUrl(config) {
  // Indentation and comments would only add weight to the bookmark.
  const source = healthhubSlotFinder.toString().split('\n').map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//')).join('\n');
  return `javascript:${encodeURIComponent(`void (${source})(${JSON.stringify(config)});`)}`;
}

function update() {
  const types = checked('type');
  const locations = checked('location');
  const months = checked('month').map(Number);
  if (!types.length || !months.length) {
    summary.textContent = `Tick at least one ${types.length ? 'month' : 'appointment type'} to get your bookmark.`;
    bookmarklet.removeAttribute('href');
    return;
  }

  const searches = TYPES.filter((type) => types.includes(type.name))
    .reduce((sum, type) => sum + type.locations.filter((name) => !locations.length || locations.includes(name)).length, 0);
  const days = months.reduce((sum, offset) => sum + (monthStart(offset + 1) - Math.max(monthStart(offset), today)) / 864e5, 0);
  const minutes = Math.ceil(searches * days * SECONDS_PER_DAY_SEARCHED / 60);
  const adjacent = months.every((offset, index) => !index || offset === months[index - 1] + 1);
  summary.textContent = `Searches for ${listOf(types, 'appointment types')} at `
    + `${locations.length ? listOf(locations, 'polyclinics') : `every polyclinic offering ${types.length > 1 ? 'them' : 'it'}`}, `
    + (months.length > 1 && adjacent
      ? `from ${months[0] ? monthLabel(months[0]) : 'today'} to the end of ${monthLabel(months.at(-1))}`
      : `in ${listOf(months.map(monthLabel), 'months')}`)
    + `. Takes about ${minutes > 1 ? `${minutes} minutes` : 'a minute'}.`;
  bookmarklet.href = bookmarkletUrl({types, locations, months, resultsUrl: new URL('results.html', location.href).href});
}

typeList.append(...APPOINTMENT_GROUPS.map((group) => el('div', {className: 'group'},
  el('h3', {textContent: group.name}),
  ...group.types.map((type) => option('option', 'type', type.name, type.name, DEFAULT_TYPES.includes(type.name))))));
monthList.append(...Array.from({length: MONTH_CHOICES}, (_, offset) => option(
  'chip', 'month', offset, offset ? monthLabel(offset) : `This month (${monthLabel(0)})`, DEFAULT_MONTHS.includes(offset))));
showLocations(DEFAULT_LOCATIONS);
update();
// Bring the ticked appointment type into view inside its scroll box.
const tickedType = typeList.querySelector('input:checked').closest('.option');
typeList.scrollTop = tickedType.offsetTop - typeList.offsetTop - typeList.clientHeight / 2;

document.addEventListener('change', (event) => {
  if (event.target.name === 'type') showLocations(checked('location'));
  update();
});

document.getElementById('type-filter').addEventListener('input', (event) => {
  const wanted = event.target.value.trim().toLowerCase();
  for (const group of typeList.children) {
    const options = [...group.querySelectorAll('.option')];
    for (const item of options) item.hidden = !item.textContent.toLowerCase().includes(wanted);
    group.hidden = options.every((item) => item.hidden);
  }
});

document.getElementById('clear-locations').addEventListener('click', () => {
  showLocations([]);
  update();
});

// On this page the button is for dragging; running it here would do nothing useful.
bookmarklet.addEventListener('click', (event) => {
  event.preventDefault();
  bookmarkHint.firstChild.textContent = 'Don’t click it here: drag it onto your bookmarks bar, or ';
});

document.getElementById('copy').addEventListener('click', async (event) => {
  if (!bookmarklet.href) return;
  await navigator.clipboard.writeText(bookmarklet.href);
  event.target.textContent = 'code copied';
});
