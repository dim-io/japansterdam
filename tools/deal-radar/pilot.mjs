import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { probe } from './apify-probe.mjs';
import { estimateFromShop } from './trial.mjs';
import { assess, alertText, fetchJson, sendTelegram, shouldAlert } from './radar.mjs';

async function persist(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + '.tmp', JSON.stringify(value));
  await fs.rename(file + '.tmp', file);
}

export async function pilot({ env = process.env, fetcher = fetch, probeFn = probe, now = Date.now(), settings, stateFile, log = console.log } = {}) {
  const config = JSON.parse(await fs.readFile(new URL('./config.json', import.meta.url), 'utf8'));
  settings ||= JSON.parse(await fs.readFile(new URL('./pilot.json', import.meta.url), 'utf8'));
  const start = Date.parse(settings.startsAt), end = Date.parse(settings.endsAt);
  // Fixed window: re-running a workflow never extends this test automatically.
  if (!settings.enabled || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * 3_600_000
    || now < start || now >= end) { log('PILOT_INACTIEF: buiten het vaste proefvenster.'); return { inactive: true }; }
  if (!Number.isInteger(settings.maxAttempts) || settings.maxAttempts < 1 || settings.maxAttempts > 25) throw new Error('Ongeldige proeflimiet.');
  if (!env.APIFY_TOKEN || !/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN || '') || !/^\d+$/.test(env.TELEGRAM_CHAT_ID || '')) throw new Error('De Apify- of Telegraminstellingen ontbreken.');
  stateFile ||= new URL('./.state/pilot.json', import.meta.url).pathname;
  let state;
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Proefstatus is onleesbaar; geen scan uitgevoerd.'); state = { attempts: 0, slots: {}, alerts: {} }; }
  if (!Number.isInteger(state.attempts) || !state.slots || !state.alerts) throw new Error('Ongeldige proefstatus.');
  const slot = Math.floor(now / 3_600_000);
  if (state.slots[slot]) { log('Dit uur is al gecontroleerd; geen dubbele scan.'); return { skipped: true }; }
  if (state.attempts >= Math.min(settings.maxAttempts, 25)) { log('De proeflimiet is bereikt; geen nieuwe scan.'); return { inactive: true }; }
  // Without a valuation source we stop before spending scraping credits.
  const products = await fetchJson(config.inventoryUrl, { fetcher });
  if (!Array.isArray(products) || !products.length) throw new Error('Shopreferenties ontbreken; geen scan uitgevoerd.');
  state.attempts++;
  state.slots[slot] = true;
  await persist(stateFile, state);
  const result = await probeFn({ token: env.APIFY_TOKEN, brandIds: Object.values(settings.brands).join(','), fetcher });
  const decisions = result.items.map((item) => {
    const valuation = estimateFromShop(item, products, config);
    return { item, deal: assess({ ...item, ...(valuation ? { valuation } : {}) }, config, now) };
  });
  let sent = 0;
  const candidates = decisions.filter(({ deal }) => deal.eligible && shouldAlert(deal, state))
    .sort((a, b) => b.deal.score - a.deal.score);
  for (const { deal } of candidates) {
    // Recheck state so duplicate records in one result set cannot notify twice.
    if (!shouldAlert(deal, state)) continue;
    const text = (deal.valuationKind === 'estimate' ? 'RADARPROEF — KANDIDAAT OP BASIS VAN SCHATTING\n\n' : 'RADARPROEF\n\n') + alertText(deal);
    const messageId = await sendTelegram(text, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, fetcher);
    state.alerts[deal.id] = { price: deal.price, sentAt: now, messageId };
    await persist(stateFile, state);
    sent++;
  }
  const report = { pilot: true, runId: result.runId, attempts: state.attempts, checked: result.items.length, sent,
    scope: Object.keys(settings.brands), endsAt: settings.endsAt,
    decisions: decisions.map(({ item, deal }) => ({ title: item.title, price: item.price, brand: item.brand, score: deal.score ?? null, reason: deal.reason })) };
  log(JSON.stringify(report));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await pilot(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
