import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Exercise the real validation function without exposing it in the Worker API.
const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const { cleanProduct } = await import('data:text/javascript;base64,' + Buffer.from(source + '\nexport { cleanProduct };').toString('base64'));
const displaySource = await readFile(new URL('../../js/measurements.js', import.meta.url), 'utf8');
const { formatMeasurement } = await import('data:text/javascript;base64,' + Buffer.from(displaySource).toString('base64'));
const product = { name: 'Test garment', category: 'Tops', price: 100, images: [], condition: 'Very good', conditionNotes: 'Light signs of wear. No visible holes or stains.' };
const clean = (measurements) => cleanProduct({ ...product, measurements }, 'test', 123);

test('centimeters remain the stored source of truth for all five fields', () => {
  const measurements = { chest: 60.5, shoulder: 50.8, sleeveLength: 61, length: 75, hem: 58 };
  const saved = JSON.parse(JSON.stringify(clean(measurements)));
  assert.deepEqual(saved.measurements, measurements);
  assert.equal(saved.addedOn, 123);
});

test('existing products and blank fields need no measurements', () => {
  assert.deepEqual(clean().measurements, {});
  assert.deepEqual(clean({ chest: null, length: '', hem: 58, unknown: 90 }).measurements, { hem: 58 });
});

test('reject invalid objects and measurements before storage', () => {
  for (const value of [null, [], '60']) assert.throws(() => clean(value), /Measurements must be an object/);
  for (const value of [-1, 0, 0.09, 1001, NaN, Infinity, '60', true, {}]) {
    assert.throws(() => clean({ chest: value }), /chest must be a measurement/);
  }
  assert.equal(clean({ chest: 0.1, length: 1000 }).measurements.length, 1000);
});

test('inch conversion, rounding and missing values', () => {
  assert.equal(formatMeasurement(50.8), '50.8 cm');
  assert.equal(formatMeasurement(50.8, 'in'), '20 in');
  assert.equal(formatMeasurement(60.5, 'in'), '23.8 in');
  for (const value of [undefined, null, '', '50', 0, -1, NaN, Infinity]) {
    assert.equal(formatMeasurement(value, 'in'), '—');
  }
});
