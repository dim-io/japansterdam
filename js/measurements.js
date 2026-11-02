// Centimeters are the source of truth. Inches are calculated only for display.
export const MEASUREMENT_FIELDS = [
  ['chest', 'Chest'],
  ['shoulder', 'Shoulder'],
  ['sleeveLength', 'Sleeve length'],
  ['length', 'Length'],
  ['hem', 'Hem'],
];

export function formatMeasurement(cm, unit = 'cm') {
  if (typeof cm !== 'number' || !Number.isFinite(cm) || cm <= 0) return '—';
  const value = unit === 'in' ? cm / 2.54 : cm;
  return `${Number(value.toFixed(1))} ${unit}`;
}

export function measurementsBlock(measurements = {}) {
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
  const list = document.createElement('dl');
  list.className = 'measurements__list';
  list.setAttribute('aria-live', 'polite');
  const values = MEASUREMENT_FIELDS.map(([key, label]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const value = document.createElement('dd');
    row.append(term, value);
    list.append(row);
    return [key, value];
  });
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
    values.forEach(([key, value]) => { value.textContent = formatMeasurement(measurements?.[key], unit); });
  }
  const note = document.createElement('p');
  note.className = 'measurements__note';
  note.textContent = 'Measured flat in centimeters. Approximate measurements; — indicates unavailable.';
  head.append(title, toggle);
  section.append(head, list, note);
  paint('cm');
  return section;
}
