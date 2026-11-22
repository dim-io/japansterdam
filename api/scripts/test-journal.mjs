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
