import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const { cleanProduct, CONDITIONS } = await import('data:text/javascript;base64,' + Buffer.from(source + '\nexport { cleanProduct, CONDITIONS };').toString('base64'));
const product = { name: 'Archive shirt', category: 'Tops', price: 100, images: [], condition: 'Very good', conditionNotes: 'Light wear. No visible holes or stains.' };
const clean = (overrides = {}) => cleanProduct({ ...product, ...overrides }, 'shirt', 123);

test('save each of the five conditions and trimmed, product-specific notes', () => {
  assert.equal(CONDITIONS.length, 5);
  for (const condition of CONDITIONS) {
    const saved = clean({ condition, conditionNotes: '  Small repair on the cuff.\nShown in photo 6.  ' });
    assert.equal(saved.condition, condition);
    assert.equal(saved.conditionNotes, 'Small repair on the cuff.\nShown in photo 6.');
    assert.equal(saved.slug, 'shirt');
    assert.equal(saved.addedOn, 123);
  }
});

test('condition and notes are required; no automatic grade for legacy products', () => {
  for (const condition of [undefined, null, '', ' ', '8/10', 'Like new', 8]) assert.throws(() => clean({ condition }), /Choose a condition/);
  for (const conditionNotes of [undefined, null, '', '   ', '\n', 123, {}]) assert.throws(() => clean({ conditionNotes }), /Condition notes are required/);
});

test('notes length is bounded and plain text is preserved', () => {
  assert.equal(clean({ conditionNotes: 'a'.repeat(600) }).conditionNotes.length, 600);
  assert.throws(() => clean({ conditionNotes: 'a'.repeat(601) }), /600 characters/);
  const text = '<img src=x onerror=alert(1)> & cuff repair';
  assert.equal(clean({ conditionNotes: text }).conditionNotes, text);
});

test('admin and backend offer exactly the same condition choices', async () => {
  const admin = await readFile(new URL('../../admin/admin.js', import.meta.url), 'utf8');
  const choices = admin.match(/const CONDITIONS = (\[[^\n]+\]);/)[1];
  assert.deepEqual(JSON.parse(choices.replaceAll("'", '"')), CONDITIONS);
});
