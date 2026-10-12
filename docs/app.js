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
const map = document.getElementById('map');

function el(tag, properties, ...children) {
  const element = Object.assign(document.createElement(tag), properties);
  element.append(...children);
  return element;
}

function svg(tag, attributes, ...children) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

function option(className, name, value, label, checked) {
  return el('label', {className}, el('input', {type: 'checkbox', name, value, checked}), el('span', {textContent: label}));
}

function typeOption(type) {
  const item = option('option', 'type', type.name, type.name, DEFAULT_TYPES.includes(type.name));
  item.firstChild.disabled = !type.locations.length;
  // The note is the button's label, which the stylesheet also shows as its tooltip.
  if (type.note) item.append(el('button', {type: 'button', className: 'info', textContent: '!', ariaLabel: type.note}));
  return item;
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

// --- map ---------------------------------------------------------------------

const townShapes = new Map(SINGAPORE_MAP.towns.map((town) => [town.name, svg('path', {d: town.path})]));
const pins = new Map(Object.entries(POLYCLINICS).map(([name, clinic]) => [name, svg('circle', {
  class: 'pin',
  cx: (clinic.lng - SINGAPORE_MAP.west) * SINGAPORE_MAP.scaleX,
  cy: (SINGAPORE_MAP.north - clinic.lat) * SINGAPORE_MAP.scaleY,
  tabindex: 0,
  role: 'button',
  'aria-label': name,
})]));
const details = el('div', {className: 'map-details', hidden: true});

function drawMap() {
  const polyclinicTowns = new Set(Object.values(POLYCLINICS).map((clinic) => clinic.town));
  map.append(
    svg('svg', {viewBox: `0 0 ${SINGAPORE_MAP.width} ${SINGAPORE_MAP.height}`, role: 'group', 'aria-label': 'Map of polyclinics'},
      svg('g', {class: 'towns'}, ...townShapes.values()),
      svg('g', {class: 'town-names'}, ...SINGAPORE_MAP.towns.filter((town) => polyclinicTowns.has(town.name))
        .map((town) => svg('text', {x: town.x, y: town.y}, town.name))),
      svg('g', {}, ...pins.values())),
    details);
  for (const [name, pin] of pins) {
    pin.addEventListener('pointerenter', () => showDetails(name));
    pin.addEventListener('focus', () => showDetails(name));
    pin.addEventListener('pointerleave', () => hideDetails(name));
    pin.addEventListener('blur', () => hideDetails(name));
    pin.addEventListener('click', () => tickPolyclinic(name));
    pin.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      tickPolyclinic(name);
    });
  }
}

// The polyclinic's details beside its pin, opening towards the middle of the map.
function showDetails(name) {
  const clinic = POLYCLINICS[name];
  const x = pins.get(name).cx.baseVal.value / SINGAPORE_MAP.width;
  const y = pins.get(name).cy.baseVal.value / SINGAPORE_MAP.height;
  details.replaceChildren(
    el('strong', {textContent: name}),
    el('span', {textContent: `${clinic.town} · ${clinic.network}`}),
    el('span', {textContent: clinic.address}),
    ...POLYCLINIC_HOURS[clinic.network].map((hours) => el('span', {textContent: hours})));
  details.className = `map-details ${x < 0.35 ? 'opens-right' : x > 0.65 ? 'opens-left' : ''} ${y < 0.45 ? 'opens-down' : ''}`;
  details.style.setProperty('--pin-x', `${x * 100}%`);
  details.style.setProperty('--pin-y', `${y * 100}%`);
  details.hidden = false;
  townShapes.get(clinic.town).classList.add('current');
}

function hideDetails(name) {
  details.hidden = true;
  townShapes.get(POLYCLINICS[name].town).classList.remove('current');
}

function tickPolyclinic(name) {
  const box = [...locationList.querySelectorAll('input')].find((input) => input.value === name);
  if (box) box.click();
}

// Marks the pins of the polyclinics on offer and of those ticked, the latter drawn on top.
function showPins() {
  const offered = [...locationList.querySelectorAll('input')].map((input) => input.value);
  const ticked = checked('location');
  for (const [name, pin] of pins) {
    pin.classList.toggle('offered', offered.includes(name));
    pin.classList.toggle('ticked', ticked.includes(name));
    if (ticked.includes(name) && pin.nextSibling) pin.parentNode.append(pin);
  }
}

function bookmarkletUrl(config) {
  // Indentation and comments would only add weight to the bookmark.
  const source = healthhubSlotFinder.toString().split('\n').map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//')).join('\n');
  return `javascript:${encodeURIComponent(`void (${source})(${JSON.stringify(config)});`)}`;
}

function update() {
  showPins();
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
  ...group.types.map(typeOption))));
monthList.append(...Array.from({length: MONTH_CHOICES}, (_, offset) => option(
  'chip', 'month', offset, offset ? monthLabel(offset) : `This month (${monthLabel(0)})`, DEFAULT_MONTHS.includes(offset))));
drawMap();
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
