import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const { publicContent } = await import('data:text/javascript;base64,' + Buffer.from(source + '\nexport { publicContent };').toString('base64'));

test('public content excludes drafts, including stories without an explicit publish choice', () => {
  const content = { home: { title: 'Home' }, journal: { title: 'Journal', articles: [
    { slug: 'live', published: true, bodyHtml: 'Public essay' },
    { slug: 'draft', published: false, bodyHtml: 'Private draft' },
    { slug: 'unreviewed', bodyHtml: 'Private draft' },
    { slug: 'imported', published: 'true', bodyHtml: 'Private draft' },
  ] } };
  assert.deepEqual(publicContent(content).journal.articles.map(a => a.slug), ['live']);
  assert.equal(content.journal.articles.length, 4);
  assert.deepEqual(publicContent(content).home, content.home);
});

test('legacy page content and an empty Journal stay usable', () => {
  assert.deepEqual(publicContent({ home: {} }), { home: {} });
  assert.deepEqual(publicContent({ journal: { title: 'Journal' } }).journal.articles, []);
});

test('public company identity comes from commerce settings and exposes only contact fields', () => {
  const original = { site: { email: 'editor@example.com', business: { company: 'Stale value' } }, journal: { articles: [{ published: false }] } };
  const projected = publicContent(original, { company: ' Japansterdam ', kvk: '42217083', vat: 'NL005593473B70', address: 'Amsterdam', email: 'hello@example.com', phone: '+31655107791', returnAddress: 'Amsterdam', enabled: true, taxNote: 'Internal review', reviewed: true, mode: 'test', apiKey: 'secret' });
  assert.deepEqual(Object.keys(projected.site.business).sort(), ['address','company','email','kvk','phone','returnAddress','vat']);
  assert.equal(projected.site.business.company, 'Japansterdam');
  assert.equal(projected.journal.articles.length, 0);
  assert.equal(original.site.business.company, 'Stale value');
  assert.deepEqual(publicContent(original, {}).site.business, {});
});
