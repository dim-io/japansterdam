import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { probe } from './apify-probe.mjs';
import { assess, alertText, fetchJson, identifyBrand, normalize, sendTelegram } from './radar.mjs';

export function garmentType(name) {
  const text = normalize(name);
  if (/\b(set|co ord|coord|ensemble|suit)\b/.test(text)) return 'set';
  if (/\b(short|shorts|bermuda|bermudas)\b/.test(text)) return 'shorts';
  if (/\b(pants|trousers|pantalon|pantalone|broek|jeans|hose|jogging|joggers)\b/.test(text)) return 'trousers';
  if (/\b(t shirt|tshirt|tee)\b/.test(text)) return 'tee';
  if (/\b(shirt|chemise|overhemd|hemd)\b/.test(text)) return 'shirt';
  if (/\b(hoodie|sweatshirt|sweater|knit|cardigan|trui)\b/.test(text)) return 'knit';
  if (/\b(jacket|coat|parka|blazer|jas|veste|manteau)\b/.test(text)) return 'outerwear';
  return null;
}

export function estimateFromShop(item, products, config) {
  const brand = identifyBrand(item.brand, config), type = garmentType(item.title);
  if (!brand || !type) return null;
  const references = products.filter((p) => identifyBrand(p.brand, config) === brand && garmentType(p.name) === type
    && typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0);
  if (!references.length) return null;
  const prices = references.map((p) => p.price).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const reference = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  return { basis: 'japansterdam_asking', low: Math.round(reference * .45), high: Math.round(reference * .65),
    references: references.slice(0, 3).map((p) => ({ title: p.name, price: p.price })) };
}

export async function trial({ env = process.env, fetcher = fetch, probeFn = probe, now = Date.now(), log = console.log } = {}) {
  const config = JSON.parse(await fs.readFile(new URL('./config.json', import.meta.url), 'utf8'));
  const request = JSON.parse(await fs.readFile(new URL('./trial-request.json', import.meta.url), 'utf8'));
  // Check all credentials before consuming any Apify credits.
  if (!env.APIFY_TOKEN || !/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN || '') || !/^\d+$/.test(env.TELEGRAM_CHAT_ID || '')) {
    throw new Error('APIFY_TOKEN, TELEGRAM_BOT_TOKEN of TELEGRAM_CHAT_ID ontbreekt of is ongeldig.');
  }
  const stateFile = env.RADAR_TRIAL_STATE_FILE || new URL('./.state/trial.json', import.meta.url);
  let previous;
  try { previous = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('Proefstatus is onleesbaar; gestopt om een dubbele verzending te voorkomen.'); }
  if (previous?.requestId === request.requestId) { log('Deze proef is al verzonden; geen nieuwe scan of Telegrammelding.'); return { skipped: true }; }
  let inventory = [], inventoryAvailable = true;
  try {
    inventory = await fetchJson(config.inventoryUrl, { fetcher });
    if (!Array.isArray(inventory)) throw new Error('Geen productlijst');
  } catch { inventory = []; inventoryAvailable = false; }
  const result = await probeFn({ token: env.APIFY_TOKEN, fetcher });
  const checked = result.items.map((item) => {
    const valuation = estimateFromShop(item, inventory, config);
    return { item, assessment: assess({ ...item, ...(valuation ? { valuation } : {}) }, config, now) };
  });
  const evaluated = checked.filter((entry) => typeof entry.assessment.score === 'number').sort((a, b) => b.assessment.score - a.assessment.score);
  const selected = evaluated[0];
  const details = selected ? [
    selected.assessment.eligible ? 'Deze kandidaat haalt de ingestelde drempel, op basis van een SCHATTING.' : 'Deze kandidaat haalt de ingestelde koopjesdrempel NIET. Dit is een verbindingstest.',
    alertText(selected.assessment).replace(/^JAPANSTERDAM FIND/, 'BEOORDEELDE KANDIDAAT'),
  ].join('\n\n') : [
    'Er is nog geen voldoende onderbouwde kandidaat voor een koopjesalert.',
    ...checked.map(({ item, assessment }) => `${item.title} · €${item.price.toFixed(2)}\nBeoordeling: ${assessment.reason}\n${item.url}`),
  ].join('\n\n');
  const message = ['PROEFMELDING — JAPANSTERDAM RADAR', 'Verse Vinted-resultaten → beoordeling → Telegram.',
    `${result.items.length} advertenties ontvangen. ${inventoryAvailable ? 'Prijsreferenties uit de actuele Japansterdam-shop gecontroleerd.' : 'Shopreferenties niet bereikbaar; geen prijsinschatting verzonnen.'}`,
    details, 'Dit is één handmatige proef. Het uurschema staat nog uit; controleer vóór kopen altijd het model, de foto’s, maten en werkelijke kosten.'].join('\n\n');
  // Emit only the small listing/assessment subset; never tokens or seller data.
  log(JSON.stringify({ runId: result.runId, trial: true, items: checked.map(({ item, assessment }) => ({ title: item.title, brand: item.brand, url: item.url, price: item.price, condition: item.condition, score: assessment.score ?? null, reason: assessment.reason })) }));
  const messageId = await sendTelegram(message, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, fetcher);
  const filename = stateFile instanceof URL ? stateFile.pathname : stateFile;
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename + '.tmp', JSON.stringify({ requestId: request.requestId, messageId, sentAt: now, apifyRunId: result.runId }));
  await fs.rename(filename + '.tmp', filename);
  log('PROEF_VERZONDEN message_id=' + messageId);
  return { sent: true, messageId, checked };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await trial(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
