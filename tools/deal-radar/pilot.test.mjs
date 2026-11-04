import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pilot } from './pilot.mjs';
import { estimateFromShop } from './trial.mjs';

const config = JSON.parse(await fs.readFile(new URL('./config.json', import.meta.url), 'utf8'));
const now = Date.now();
const settings = { enabled: true, startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 23 * 3600000).toISOString(), maxAttempts: 25, brands: { Needles: '360271', Kapital: '576107' } };
const products = [{ name: 'Needles Painter Trousers', brand: 'Needles', price: 210 }];
const env = { APIFY_TOKEN: 'key', TELEGRAM_BOT_TOKEN: '123:token', TELEGRAM_CHAT_ID: '42' };
const item = { title: 'Needles Painter Trousers', brand: 'Needles', price: 10, currency: 'EUR', condition: 'very_good', available: true, observedAt: new Date(now).toISOString(), url: 'https://www.vinted.nl/items/123456-test', comparables: [] };

test('mainline prices are never used for Uniqlo collaborations', () => {
  assert.equal(estimateFromShop({ ...item, description: 'Uniqlo collaboration' }, products, config), null);
  assert(estimateFromShop(item, products, config));
});

test('pilot stops outside its fixed window before network access or credentials', async () => {
  let calls = 0;
  const opts = { settings, fetcher: async () => { calls++; }, env: {}, log: () => {} };
  assert((await pilot({ ...opts, now: Date.parse(settings.endsAt) })).inactive);
  assert((await pilot({ ...opts, now: Date.parse(settings.startsAt) - 1 })).inactive);
  assert((await pilot({ ...opts, settings: { ...settings, enabled: false }, now })).inactive);
  assert.equal(calls, 0);
});

test('one scan per slot, duplicate alerts suppressed, high estimates clearly labeled', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-pilot-'));
  try {
    let scans = 0, messages = [];
    const opts = { env, settings, stateFile: path.join(dir, 'pilot.json'), now, log: () => {},
      probeFn: async (args) => { scans++; assert.equal(args.brandIds, '360271,576107'); return { runId: 'test', items: [item, item] }; },
      fetcher: async (url, options) => {
        if (String(url).includes('workers.dev')) return Response.json(products);
        messages.push(JSON.parse(options.body));
        return Response.json({ ok: true, result: { message_id: messages.length } });
      } };
    assert.equal((await pilot(opts)).sent, 1);
    assert(messages[0].text.includes('KANDIDAAT OP BASIS VAN SCHATTING'));
    assert((await pilot(opts)).skipped);
    assert.equal(scans, 1);
    assert.equal((await pilot({ ...opts, now: now + 3600000 })).sent, 0);
    assert.equal(scans, 2);
    const state = JSON.parse(await fs.readFile(opts.stateFile, 'utf8'));
    state.attempts = 25;
    await fs.writeFile(opts.stateFile, JSON.stringify(state));
    assert((await pilot({ ...opts, now: now + 7200000 })).inactive);
    assert.equal(scans, 2);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('failed provider attempt is reserved and is not retried within the same slot', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-pilot-'));
  try {
    let scans = 0;
    const opts = { env, settings, now, stateFile: path.join(dir, 'state.json'), log: () => {}, fetcher: async () => Response.json(products),
      probeFn: async () => { scans++; throw new Error('Provider unavailable'); } };
    await assert.rejects(pilot(opts), /Provider unavailable/);
    assert((await pilot(opts)).skipped);
    assert.equal(scans, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
