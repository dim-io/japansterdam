import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRow, probe } from './apify-probe.mjs';

const row = { link: 'https://www.vinted.nl/items/123456-test', title: 'Test item', price: 30, currency: 'EUR', brand: 'Needles', condition: 'Very good', availability: 'available' };

test('normalization preserves uncertainty and never invents comparables', () => {
  const item = normalizeRow(row, '2026-11-04T12:00:00Z');
  assert.equal(item.available, true);
  assert.equal(item.condition, 'very_good');
  assert.deepEqual(item.comparables, []);
  assert.equal(normalizeRow({ ...row, availability: undefined, condition: undefined }, '').available, null);
  assert.equal(normalizeRow({ ...row, price: 41 }, ''), null);
  assert.equal(normalizeRow({ ...row, currency: 'GBP' }, ''), null);
});

test('probe restricts the run, uses header authentication and reports only three results', async () => {
  let posted = 0;
  const fetcher = async (raw, options) => {
    const url = new URL(raw);
    assert.equal(options.headers.Authorization, 'Bearer private-token');
    assert(!url.searchParams.has('token'));
    if (options.method === 'POST') {
      posted++;
      assert.equal(url.searchParams.get('maxTotalChargeUsd'), '0.02');
      assert.equal(url.searchParams.get('timeout'), '90');
      const input = JSON.parse(options.body);
      assert.equal(input.searchQueries.length, 1);
      assert.equal(new URL(input.searchQueries[0]).searchParams.get('brand_ids[]'), '360271');
      assert.equal(new URL(input.searchQueries[0]).searchParams.get('price_to'), '40');
      assert.equal(input.brandIds, '360271');
      assert.equal(input.maxResults, 3);
      assert.equal(input.maxPrice, 40);
      return Response.json({ data: { id: 'Run123', status: 'SUCCEEDED', defaultDatasetId: 'Data123', finishedAt: '2026-11-04T12:00:00Z' } });
    }
    return Response.json([row, row, row, row]);
  };
  const result = await probe({ token: 'private-token', fetcher });
  assert.equal(posted, 1);
  assert.equal(result.items.length, 3);
  assert.equal(result.confirmedAvailable, 3);
});

test('missing tokens and provider failures stop without leaking credentials or retrying starts', async () => {
  await assert.rejects(probe({}), /APIFY_TOKEN/);
  let requests = 0;
  await assert.rejects(probe({ token: 'private-token', fetcher: async () => { requests++; throw new Error('private-token'); } }), (e) => !e.message.includes('private-token'));
  assert.equal(requests, 1);
  await assert.rejects(probe({ token: 'private-token', fetcher: async () => new Response('', { status: 401 }) }), /HTTP 401/);
});
