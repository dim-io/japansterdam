import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assess as assessRaw, alertText, identifyBrand, listingUrl, shouldAlert, run, sendTelegram, fetchJson } from './radar.mjs';

import { fixtureReviews, photoFixture } from './auth-fixture.mjs';
const assess = (item, config, now) => assessRaw(item, {...config, authenticityReviews: fixtureReviews(item, now)}, now);

const config = JSON.parse(await fs.readFile(new URL('./config.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-11-04T12:00:00Z');
const sample = (changes = {}) => ({
  url: 'https://www.vinted.nl/items/1234567890-fixture', title: 'Fictief testjasje', brand: 'Needles',
  photoUrls: photoFixture, price: 30, currency: 'EUR', size: 'L', available: true, condition: 'very_good', flaws: [],
  publishedAt: new Date(now - 30 * 60_000).toISOString(), observedAt: new Date(now - 5 * 60_000).toISOString(),
  comparables: [
    { url: 'https://www.grailed.com/listings/101-fixture', price: 180, currency: 'EUR', status: 'sold', match: 'same_model', observedAt: '2026-10-25T12:00:00Z' },
    { url: 'https://www.grailed.com/listings/102-fixture', price: 160, currency: 'EUR', status: 'sold', match: 'same_model', observedAt: '2026-10-26T12:00:00Z' },
  ], ...changes,
});

test('a supported deal has an explained score and conservative net-cost estimate', () => {
  const deal = assess(sample(), config, now);
  assert(deal.eligible);
  assert.equal(deal.totalCost, 40);
  assert.equal(deal.resale, 153);
  assert(Math.abs(deal.margin - 88.05) < .001);
  assert.equal(deal.scores.condition, 8.5);
  const text = alertText(deal);
  assert(text.includes('schatting, geen garantie'));
  assert(text.includes('vóór belasting en eigen tijd'));
  assert(text.includes('foto’s zelf controleren'));
  assert(text.includes(deal.url));
  assert(text.length < 4000);
});

test('price, availability and fresh observation are hard gates', () => {
  for (const change of [
    { price: 40.01 }, { price: -1 }, { price: 0 }, { price: NaN }, { price: '20' }, { currency: 'GBP' },
    { available: false }, { available: undefined }, { isBundle: true },
    { observedAt: '2025-01-01' }, { observedAt: undefined },
    { publishedAt: new Date(now + 86_400_000).toISOString() },
  ]) assert.equal(assess(sample(change), config, now).eligible, false, JSON.stringify(change));
  assert.equal(assess(sample({ price: 40 }), config, now).eligible, true);
  assert.equal(assess(sample({ publishedAt: '2024-01-01' }), config, now).eligible, true);
  assert.equal(assess(sample({ publishedAt: undefined }), config, now).eligible, true);
});

test('a cheap piece does not win without condition, fit and sale evidence', () => {
  for (const change of [
    { brand: 'Generic' }, { condition: undefined }, { condition: 'satisfactory' }, { flaws: ['Hole'] },
    { description: 'Replica' }, { authenticity: 'suspect' }, { comparables: [] },
    { comparables: sample().comparables.map((c) => ({ ...c, status: 'asking' })) },
    { comparables: sample().comparables.map((c) => ({ ...c, match: 'similar_brand' })) },
    { comparables: [sample().comparables[0], sample().comparables[0]] },
    { comparables: sample().comparables.map((c) => ({ ...c, observedAt: '2024-01-01' })) },
    { comparables: sample().comparables.map((c) => ({ ...c, price: 40 })) },
  ]) assert.equal(assess(sample({ price: 5, ...change }), config, now).eligible, false, JSON.stringify(change));
});

test('aliases are recognized, but a vague title does not establish a brand', () => {
  assert.equal(identifyBrand('KAPITAL Kountry', config), 'Kapital');
  assert.equal(identifyBrand('Ts(S)', config), 'Ts(s)');
  assert.equal(identifyBrand('Guilty Parties', config), 'Wacko Maria');
  assert.equal(identifyBrand('Unknown Needles style', config), null);
  assert.equal(assess(sample({ brand: '', title: 'Needles inspired shirt' }), config, now).eligible, false);
});

test('direct links reject misleading domains, credentials and non-item URLs', () => {
  assert.equal(listingUrl(sample().url + '?ref=x'), sample().url);
  for (const url of ['https://www.vinted.nl.evil.example/items/123', 'http://www.vinted.nl/items/123',
    'https://evil.example/items/123', 'https://user:secret@www.vinted.nl/items/123', 'https://www.vinted.nl/catalog']) assert.equal(listingUrl(url), null);
});

test('only significant price reductions trigger a repeat alert', () => {
  const deal = assess(sample(), config, now), state = { alerts: { [deal.id]: { price: 30 } } };
  assert.equal(shouldAlert(deal, state), false);
  assert.equal(shouldAlert({ ...deal, price: 29 }, state), false);
  assert.equal(shouldAlert({ ...deal, price: 24 }, state), true);
});

test('HTTP errors and unconfirmed Telegram delivery fail closed without exposing tokens', async () => {
  await assert.rejects(fetchJson('https://feed.example', { fetcher: async () => new Response('', { status: 403 }) }), /HTTP 403/);
  await assert.rejects(fetchJson('http://feed.example'), /HTTPS/);
  await assert.rejects(sendTelegram('test', '123:secret', '42', async () => new Response(JSON.stringify({ ok: false }), { status: 403 })), /niet bevestigd/);
  await assert.rejects(sendTelegram('test', '123:secret', '42', async () => { throw new Error('123:secret'); }), (error) => !error.message.includes('123:secret'));
});

test('pipeline sends once, persists state, permits a price drop and dry-run stays silent', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'japansterdam-radar-'));
  try {
    let items = [sample(), sample()], posted = [];
    const stateFile = path.join(dir, 'alerts.json');
    const env = { RADAR_FEED_URL: 'https://feed.example/items', TELEGRAM_BOT_TOKEN: '123:secret', TELEGRAM_CHAT_ID: '42', RADAR_STATE_FILE: stateFile };
    const fetcher = async (raw, options) => {
      const url = String(raw);
      if (url.includes('workers.dev')) return Response.json([{ brand: 'Needles' }]);
      if (url.includes('feed.example')) return Response.json({ version: 1, items });
      if (url.includes('api.telegram.org')) {
        posted.push(JSON.parse(options.body));
        return Response.json({ ok: true, result: { message_id: posted.length } });
      }
      throw new Error('Unexpected request');
    };
    const first = await run({ authenticityReviews: fixtureReviews(sample(), now), env, fetcher, now, log: () => {} });
    assert.equal(first.sent, 1);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].chat_id, '42');
    assert.equal(posted[0].parse_mode, undefined);
    assert.equal((await run({ authenticityReviews: fixtureReviews(sample(), now), env, fetcher, now, log: () => {} })).sent, 0);
    items = [sample({ price: 24 })];
    assert.equal((await run({ authenticityReviews: fixtureReviews(sample(), now), env, fetcher, now, log: () => {} })).sent, 1);
    const stateBefore = await fs.readFile(stateFile, 'utf8');
    items = [sample({ price: 15 })];
    await run({ authenticityReviews: fixtureReviews(sample(), now), env: { ...env, RADAR_DRY_RUN: 'true' }, fetcher, now, log: () => {} });
    assert.equal(posted.length, 2);
    assert.equal(await fs.readFile(stateFile, 'utf8'), stateBefore);
    await fs.writeFile(stateFile, 'broken');
    await assert.rejects(run({ authenticityReviews: fixtureReviews(sample(), now), env, fetcher, now, log: () => {} }), /onleesbaar/);
    assert.equal(posted.length, 2);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('no source or Telegram means no active scanner', async () => {
  await assert.rejects(run({ authenticityReviews: fixtureReviews(sample(), now), env: {} }), /Niet geactiveerd/);
  await assert.rejects(run({ authenticityReviews: fixtureReviews(sample(), now), env: { RADAR_FEED_URL: 'https://feed.example' } }), /Telegram ontbreekt/);
});
