import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export { normalize, listingUrl, identifyBrand, assess, alertText, shouldAlert, fetchJson, sendTelegram } from './scoring.mjs';
import { normalize, listingUrl, identifyBrand, assess, alertText, shouldAlert, fetchJson, sendTelegram } from './scoring.mjs';

async function saveState(filename, state) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename + '.tmp', JSON.stringify(state));
  await fs.rename(filename + '.tmp', filename);
}

export async function run({ authenticityReviews, env = process.env, fetcher = fetch, now = Date.now(), log = console.log } = {}) {
  const config = JSON.parse(await fs.readFile(path.join(here, 'config.json'), 'utf8'));
  if (authenticityReviews) config.authenticityReviews = authenticityReviews;
  const dryRun = env.RADAR_DRY_RUN === 'true';
  if (!env.RADAR_FEED_URL) throw new Error('Niet geactiveerd: sluit eerst een toegankelijke advertentiefeed aan');
  if (!dryRun && (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)) throw new Error('Niet geactiveerd: Telegram ontbreekt');
  // Refresh the core selection from the real CMS, never overwrite shop content.
  try {
    const products = await fetchJson(config.inventoryUrl, { fetcher });
    if (!Array.isArray(products)) throw new Error('Ongeldige productlijst');
    const known = products.map((p) => identifyBrand(p.brand, config) || p.brand).filter((b) => typeof b === 'string' && b.trim());
    config.coreBrands = [...new Set([...config.coreBrands, ...known])];
  } catch { log('Merken: vaste Japansterdam-startselectie gebruikt; CMS niet bereikbaar'); }
  const feed = await fetchJson(env.RADAR_FEED_URL, { token: env.RADAR_FEED_TOKEN, fetcher });
  if (feed.version !== 1 || !Array.isArray(feed.items) || feed.items.length > 5000) throw new Error('De feed voldoet niet aan het advertentiecontract (version: 1, items: [...])');
  const seen = new Set(), deals = [], rejected = {};
  for (const item of feed.items) {
    if (!item || typeof item !== 'object') continue;
    const result = assess(item, config, now);
    if (!result.eligible) { rejected[result.reason] = (rejected[result.reason] || 0) + 1; continue; }
    if (!seen.has(result.id)) { seen.add(result.id); deals.push(result); }
  }
  const stateFile = env.RADAR_STATE_FILE || path.join(here, '.state', 'alerts.json');
  let state;
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Radarstatus is onleesbaar; gestopt om dubbele meldingen te voorkomen'); state = { alerts: {} }; }
  if (!state.alerts || typeof state.alerts !== 'object') throw new Error('Ongeldige radarstatus');
  const candidates = deals.sort((a, b) => b.score - a.score || b.margin - a.margin).filter((d) => shouldAlert(d, state)).slice(0, config.maxAlertsPerRun);
  let sent = 0;
  for (const deal of candidates) {
    if (dryRun) { log(JSON.stringify({ dryRun: true, analysis: deal })); continue; }
    const messageId = await sendTelegram(alertText(deal), env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, fetcher);
    state.alerts[deal.id] = { price: deal.price, sentAt: now, messageId };
    await saveState(stateFile, state);
    sent++;
  }
  log(JSON.stringify({ checked: feed.items.length, qualifying: deals.length, sent, dryRun, rejected }));
  return { checked: feed.items.length, qualifying: deals.length, sent, candidates };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(() => { console.error('Radarcontrole mislukt. Controleer feedtoegang, configuratie en Telegram. Geen garantie dat deze ronde is bezorgd.'); process.exitCode = 1; });
}
