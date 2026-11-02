import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/product-urls.js', import.meta.url), 'utf8');
const { createProductRoutes } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const slugIn = (path) => new URL(path, 'https://example.test/').searchParams.get('p');

test('use real garment names and keep legacy URLs working', () => {
  const p = { slug: 'bailey-short-53z3g', brand: 'Ts(S)', name: 'Ts(S) Woolblend Pinstripe Blazer' };
  const routes = createProductRoutes([p]);
  assert.equal(routes.urlFor(p.slug), 'product.html?p=ts-s-woolblend-pinstripe-blazer');
  assert.equal(routes.find(slugIn(routes.urlFor(p.slug))), p);
  assert.equal(routes.find(p.slug), p);
  assert.equal(routes.find('missing'), null);
});

test('include brand once, normalize punctuation and shorten at word boundaries', () => {
  const products = [
    { slug: 'a', brand: 'KAPITAL', name: 'KAPITAL Hope No Nukes Easy Pants' },
    { slug: 'b', brand: 'Needles', name: 'Cut-off / Frayed Shirt' },
    { slug: 'c', brand: 'BEAMS Plus', name: 'Café & Linen Shirt' },
    { slug: 'd', brand: 'Kapital', name: 'Very '.repeat(30) + 'Long Pants' },
  ];
  const r = createProductRoutes(products);
  assert.equal(slugIn(r.urlFor('a')), 'kapital-hope-no-nukes-easy-pants');
  assert.equal(slugIn(r.urlFor('b')), 'needles-cut-off-frayed-shirt');
  assert.equal(slugIn(r.urlFor('c')), 'beams-plus-cafe-and-linen-shirt');
  assert(slugIn(r.urlFor('d')).length <= 90);
});

test('duplicate names and sizes remain unique when reordered, including sold pieces', () => {
  const products = [
    { slug: 'old-a', brand: 'Needles', name: 'Shirt', size: 'XL', sold: true },
    { slug: 'old-b', brand: 'Needles', name: 'Shirt', size: 'L' },
    { slug: 'old-c', brand: 'Needles', name: 'Shirt', size: 'XL' },
  ];
  const a = createProductRoutes(products), b = createProductRoutes([...products].reverse());
  assert.equal(new Set(products.map((p) => a.urlFor(p.slug))).size, 3);
  for (const p of products) {
    assert.equal(a.urlFor(p.slug), b.urlFor(p.slug));
    assert.equal(a.find(slugIn(a.urlFor(p.slug))), p);
  }
});

test('friendly URLs cannot shadow another legacy product ID', () => {
  const products = [{ slug: 'old', brand: 'Needles', name: 'Shirt' }, { slug: 'needles-shirt', brand: 'Kapital', name: 'Pants' }];
  const r = createProductRoutes(products);
  assert.equal(r.find('needles-shirt'), products[1]);
  assert.equal(r.find(slugIn(r.urlFor('old'))), products[0]);
});

test('every catalogue item has a matching URL without changing stored data', async () => {
  const products = JSON.parse(await readFile(new URL('../data/products.json', import.meta.url), 'utf8'));
  const snapshot = JSON.stringify(products);
  const r = createProductRoutes(products);
  assert.equal(new Set(products.map((p) => r.urlFor(p.slug))).size, products.length);
  for (const p of products) {
    assert.equal(r.find(slugIn(r.urlFor(p.slug))), p);
    assert.equal(r.find(p.slug), p);
    assert.match(slugIn(r.urlFor(p.slug)), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
  assert.equal(JSON.stringify(products), snapshot);
});
