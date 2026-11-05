import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { trial, estimateFromShop, garmentType, missingReferenceReason } from './trial.mjs';
import { assess, alertText } from './radar.mjs';

import { fixtureReviews, photoFixture } from './auth-fixture.mjs';

const config = JSON.parse(await fs.readFile(new URL('./config.json', import.meta.url), 'utf8'));
const now = Date.now();
const item = { title: 'Needles Corduroy Painter Trousers', brand: 'Needles', price: 10, currency: 'EUR', condition: 'very_good',
  available: true, observedAt: new Date(now).toISOString(), url: 'https://www.vinted.nl/items/123456-fixture', comparables: [], photoUrls: photoFixture };
const products = [{ brand: 'Needles', name: 'Corduroy Painter Trousers', price: 210 }, { brand: 'Needles', name: 'Basketball Shorts', price: 175 }];
config.authenticityReviews = fixtureReviews(item, now);

test('shop estimates match brand and garment type and clearly remain estimates', () => {
  assert.equal(garmentType('Needles T-shirt'), 'tee');
  assert.equal(garmentType('Needles co-ord Set'), 'set');
  const valuation = estimateFromShop(item, products, config);
  assert.equal(valuation.low, 95);
  assert.equal(valuation.high, 137);
  assert.equal(valuation.references.length, 1);
  assert.equal(estimateFromShop({ ...item, title: 'Needles Hoodie' }, products, config), null);
  const deal = assess({ ...item, valuation }, config, now);
  assert.equal(deal.valuationKind, 'estimate');
  assert.equal(deal.resale, 95);
  assert.equal(deal.comparables.length, 0);
  assert(alertText(deal).includes('GEEN bewezen marktwaarde'));
  assert(!alertText(deal).includes('recente verkochte exemplaren'));
});

test('real-data trial sends one labeled message, persists delivery and skips an identical request', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-trial-'));
  try {
    const env = { APIFY_TOKEN: 'private-key', TELEGRAM_BOT_TOKEN: '123:private', TELEGRAM_CHAT_ID: '42', RADAR_TRIAL_STATE_FILE: path.join(dir, 'trial.json') };
    let probes = 0, sent = [];
    const probeFn = async () => { probes++; return { runId: 'testRun', items: [item] }; };
    const fetcher = async (url, options) => {
      if (String(url).includes('workers.dev')) return Response.json(products);
      sent.push(JSON.parse(options.body));
      return Response.json({ ok: true, result: { message_id: 123 } });
    };
    await trial({ authenticityReviews: fixtureReviews(item, now), env, fetcher, probeFn, now, log: () => {} });
    assert.equal(sent.length, 1);
    assert(sent[0].text.startsWith('PROEFMELDING'));
    assert(sent[0].text.includes(item.url));
    assert(sent[0].text.includes('SCHATTING'));
    assert(sent[0].text.includes('uurschema staat nog uit'));
    assert.equal((await trial({ authenticityReviews: fixtureReviews(item, now), env, fetcher, probeFn, now, log: () => {} })).skipped, true);
    assert.equal(probes, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('missing price references produce an honest diagnostic, not a fabricated score or value', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-trial-'));
  try {
    let text;
    await trial({ authenticityReviews: fixtureReviews(item, now), env: { APIFY_TOKEN: 'key', TELEGRAM_BOT_TOKEN: '123:private', TELEGRAM_CHAT_ID: '42', RADAR_TRIAL_STATE_FILE: path.join(dir, 'state.json') }, now,
      probeFn: async () => ({ runId: 'test', items: [item] }), log: () => {},
      fetcher: async (url, options) => {
        if (String(url).includes('workers.dev')) return Response.json([]);
        text = JSON.parse(options.body).text;
        return Response.json({ ok: true, result: { message_id: 2 } });
      } });
    assert(text.includes('flipwaarde blijft onbekend'));
    assert(!text.includes('verkoopinschatting:'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('missing credentials stop before any paid scan', async () => {
  let calls = 0;
  await assert.rejects(trial({ authenticityReviews: fixtureReviews(item, now), env: {}, probeFn: async () => { calls++; } }), /ontbreekt/);
  assert.equal(calls, 0);
});


test('missing collaboration references stay unknown, while German garment names can match real references', () => {
  assert.equal(garmentType('Needles Fleece Jacke'), 'outerwear');
  assert.equal(garmentType('Kapital Pullover'), 'knit');
  const collaboration = { ...item, title: 'Uniqlo x Needles Fleece Jacke' };
  assert.equal(estimateFromShop(collaboration, products, config), null);
  assert(missingReferenceReason(collaboration, products, config).includes('UNIQLO-samenwerking'));
  assert(missingReferenceReason({ ...item, title: 'Needles socks' }, products, config).includes('Kledingtype niet herkend'));
});
