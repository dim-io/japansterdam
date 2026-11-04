// Centimeters are the source of truth. Inches are calculated only for display.
export const TOP_MEASUREMENT_FIELDS = [
  ['chest', 'Chest'],
  ['shoulder', 'Shoulder'],
  ['sleeveLength', 'Sleeve length'],
  ['length', 'Length'],
  ['hem', 'Hem'],
];

export const BOTTOM_MEASUREMENT_FIELDS = [
  ['waist', 'Waist (flat)'],
  ['hip', 'Hip (flat)'],
  ['inseam', 'Inseam'],
  ['outseam', 'Outseam'],
  ['frontRise', 'Front rise'],
  ['backRise', 'Back rise'],
  ['thigh', 'Thigh (flat)'],
  ['legOpening', 'Leg opening (flat)'],
];

export function measurementGroups(measurements = {}, category = 'Tops') {
  const top = { key: '', title: 'Top', fields: TOP_MEASUREMENT_FIELDS, values: measurements };
  const bottom = { key: '', title: 'Bottoms', fields: BOTTOM_MEASUREMENT_FIELDS, values: measurements };
  if (category === 'Bottoms') return [bottom];
  // Keep the existing flat top measurements intact; only the set's bottoms
  // need a separate object, so both pieces can have independent values.
  if (category === 'Sets') return [top, { ...bottom, key: 'bottom', values: measurements.bottom || {} }];
  return [top];
}

export function formatMeasurement(cm, unit = 'cm') {
  if (typeof cm !== 'number' || !Number.isFinite(cm) || cm <= 0) return '—';
  const value = unit === 'in' ? cm / 2.54 : cm;
  return `${Number(value.toFixed(1))} ${unit}`;
}

export function measurementsBlock(measurements = {}, category = 'Tops') {
  measurements = measurements || {};
  const section = document.createElement('section');
  section.className = 'measurements';
  section.setAttribute('aria-label', 'Garment measurements');
  const head = document.createElement('div');
  head.className = 'measurements__head';
  const title = document.createElement('h2');
  title.className = 'measurements__title';
  title.textContent = 'Measurements';
  const toggle = document.createElement('div');
  toggle.className = 'measurements__units';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Measurement unit');
  const groups = measurementGroups(measurements, category);
  const body = document.createElement('div');
  const values = [];
  for (const group of groups) {
    if (groups.length > 1) {
      const heading = document.createElement('h3');
      heading.className = 'measurements__subtitle';
      heading.textContent = group.title;
      body.append(heading);
    }
    const list = document.createElement('dl');
    list.className = 'measurements__list';
    list.setAttribute('aria-label', group.title + ' measurements');
    list.setAttribute('aria-live', 'polite');
    for (const [key, label] of group.fields) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      term.textContent = label;
      const value = document.createElement('dd');
      row.append(term, value);
      list.append(row);
      values.push([group.values[key], value]);
    }
    body.append(list);
  }
  const buttons = ['cm', 'in'].map((unit) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = unit.toUpperCase();
    button.setAttribute('aria-label', unit === 'cm' ? 'Centimeters' : 'Inches');
    button.addEventListener('click', () => paint(unit));
    toggle.append(button);
    return [unit, button];
  });
  function paint(unit) {
    buttons.forEach(([key, button]) => button.setAttribute('aria-pressed', String(key === unit)));
    values.forEach(([cm, value]) => { value.textContent = formatMeasurement(cm, unit); });
    note.textContent = `Measured flat in ${unit === 'in' ? 'inches' : 'centimeters'}; widths are not doubled. Approximate measurements; — indicates unavailable.`;
  }
  const note = document.createElement('p');
  note.className = 'measurements__note';
  head.append(title, toggle);
  section.append(head, body, note);
  paint('cm');
  return section;
}
