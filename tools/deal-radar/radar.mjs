import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const normalize = (s) => String(s || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const euro = (n) => '€' + n.toFixed(2);
const median = (values) => {
  const a = [...values].sort((x, y) => x - y), mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};
const domains = new Set(['www.vinted.nl', 'www.vinted.be', 'www.vinted.fr', 'www.vinted.de', 'www.vinted.it', 'www.vinted.es', 'www.vinted.pt', 'www.vinted.at', 'www.vinted.lu']);

export function listingUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !domains.has(u.hostname) || !/^\/items\/\d+(?:-|\/|$)/.test(u.pathname)) return null;
    return u.origin + u.pathname.replace(/\/$/, '');
  } catch { return null; }
}

export function identifyBrand(raw, config) {
  const name = normalize(raw);
  for (const brand of [...config.coreBrands, ...config.peripheralBrands]) {
    if ([brand, ...(config.aliases[brand] || [])].some((alias) => normalize(alias) === name)) return brand;
  }
  return null;
}

// Evidence is supplied by the connected feed. "Sold" must mean an observed
// completed sale, never the seller's asking price. This is not image authentication.
export function assess(item, config, now = Date.now()) {
  const reject = (reason) => ({ eligible: false, reason });
  const url = listingUrl(item.url);
  if (!url) return reject('Geen geldige Vinted-itemlink');
  if (item.currency !== 'EUR' || !positive(item.price) || item.price <= 0 || item.price > config.maxItemPrice) return reject('Buiten de prijsgrens van €40 of ongeldige prijs');
  if (item.available !== true) return reject('Beschikbaarheid niet bevestigd');
  const observed = Date.parse(item.observedAt), published = Date.parse(item.publishedAt);
  if (!Number.isFinite(observed) || now - observed > config.maxFeedAgeMinutes * 60_000 || observed > now + 300_000) return reject('Prijs/beschikbaarheid niet recent genoeg gecontroleerd');
  if (item.publishedAt !== undefined && (!Number.isFinite(published) || published > now + 300_000)) return reject('Ongeldige uploadtijd');
  if (config.maxListingAgeHours !== null && (!Number.isFinite(published) || now - published > config.maxListingAgeHours * 3_600_000)) return reject('Uploadtijd ontbreekt of advertentie is te oud');
  const brand = identifyBrand(item.brand, config);
  if (!brand) return reject('Merk buiten de selectie; alleen een merkvermelding in de titel is onvoldoende');
  if (item.isBundle === true) return reject('Bundel: prijs per piece is niet betrouwbaar');
  const text = normalize(item.title + ' ' + (item.description || ''));
  if (/\b(replica|fake|counterfeit|dupe|inspired|style of|namaak|nep)\b/.test(text)) return reject('Mogelijke imitatie of style-vermelding');
  if (/\b(sewing pattern|naaipatroon|magazine|poster|boek|empty box|lege doos)\b/.test(text)) return reject('Geen passend kledingstuk of accessoire');
  if (item.authenticity === 'suspect') return reject('Authenticiteit expliciet verdacht');
  const conditionScores = { new_with_tags: 10, new_without_tags: 9.5, very_good: 8.5, good: 7, satisfactory: 3 };
  let condition = conditionScores[item.condition] || 0;
  if (item.flaws?.length) condition = Math.min(condition, 5);
  const fit = config.coreBrands.some((b) => identifyBrand(b, config) === brand) ? 10 : 8;
  const comps = (Array.isArray(item.comparables) ? item.comparables : []).filter((c) => {
    const date = Date.parse(c.observedAt);
    let source;
    try { source = new URL(c.url); } catch { return false; }
    return c.currency === 'EUR' && positive(c.price) && c.price > 0 && c.match === 'same_model' && c.status === 'sold'
      && Number.isFinite(date) && now - date <= 180 * 86_400_000 && date <= now + 300_000
      && source.protocol === 'https:' && !source.username && !source.password && source.href !== url;
  });
  const uniqueComps = [...new Map(comps.map((c) => [c.url, c])).values()];
  if (uniqueComps.length < 2) return reject('Minimaal twee recente verkochte exemplaren van hetzelfde model nodig voor een onderbouwde flipanalyse');
  const resale = median(uniqueComps.map((c) => c.price)) * .9;
  const exactCosts = positive(item.shippingCost) && positive(item.buyerFee);
  const buyingExtras = exactCosts ? item.shippingCost + item.buyerFee : config.buyingCostReserve;
  const totalCost = item.price + buyingExtras;
  const margin = resale * (1 - config.resaleFeeReserve) - totalCost - config.packingReserve;
  const roi = margin / totalCost;
  const flip = clamp(4 + margin / 25 + Math.min(roi, 3), 0, 10);
  const price = clamp((1 - totalCost / resale) * 14, 0, 10);
  const score = Math.round((flip * .35 + price * .25 + condition * .2 + fit * .2) * 10) / 10;
  const eligible = score >= config.alertScore && margin >= config.minimumMargin && roi >= config.minimumRoi && condition >= 7;
  return { eligible, reason: eligible ? 'Sterke deal' : 'Onder de ingestelde drempel', url, id: /\/items\/(\d+)/.exec(url)[1],
    title: String(item.title || brand).slice(0, 180), brand, price: item.price, size: String(item.size || 'Onbekend'),
    score, scores: { flip: +flip.toFixed(1), price: +price.toFixed(1), condition, fit }, resale, margin, totalCost, roi,
    resaleFeeReserve: config.resaleFeeReserve, packingReserve: config.packingReserve,
    costNote: exactCosts ? 'Kosten uit feed' : `Inclusief ${euro(config.buyingCostReserve)} kostenreserve; exacte koperskosten/verzending controleren`,
    conditionNote: 'Staat volgens verkoper/feed; labels, slijtage en foto’s zelf controleren',
    comparables: uniqueComps.slice(0, 3).map((c) => ({ url: c.url, price: c.price })) };
}

export function alertText(deal) {
  return [
    `JAPANSTERDAM FIND · ${deal.score}/10`,
    `${deal.brand} — ${deal.title}`, `Maat: ${deal.size} · Vraagprijs: ${euro(deal.price)}`,
    `Flipbaarheid ${deal.scores.flip}/10 · Prijs ${deal.scores.price}/10 · Staat ${deal.scores.condition}/10 · Fit ${deal.scores.fit}/10`,
    `Conservatieve verkoopindicatie: ${euro(deal.resale)} (schatting, geen garantie)`,
    `Inkoop incl. kosten/reserve: ${euro(deal.totalCost)} · Ruimte na ${Math.round(deal.resaleFeeReserve * 100)}% verkoopkosten en ${euro(deal.packingReserve)} verpakking: ${euro(deal.margin)} vóór belasting en eigen tijd`,
    deal.costNote, deal.conditionNote,
    'Gebaseerd op recente verkochte exemplaren van hetzelfde model:',
    ...deal.comparables.map((c) => `${euro(c.price)} · ${c.url}`),
    'Bekijk het item:', deal.url,
  ].join('\n');
}

export function shouldAlert(deal, state) {
  const previous = state.alerts?.[deal.id];
  return !previous || deal.price <= previous.price * .8;
}

export async function fetchJson(url, { token, fetcher = fetch } = {}) {
  let u;
  try { u = new URL(url); } catch { throw new Error('De feed-URL is ongeldig'); }
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Gebruik een HTTPS-feed; geef de token apart op');
  const response = await fetcher(u, { headers: { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error('Gegevensbron onbereikbaar (HTTP ' + response.status + ')');
  return response.json();
}

export async function sendTelegram(text, token, chatId, fetcher = fetch) {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token) || !/^-?\d+$/.test(chatId)) throw new Error('Telegram is nog niet juist ingesteld');
  let response;
  try {
    response = await fetcher('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), link_preview_options: { is_disabled: true } }),
    });
  } catch { throw new Error('Telegram kon niet worden bereikt; controleer de bezorgstatus vóór opnieuw verzenden'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok || !Number.isInteger(result.result?.message_id)) throw new Error('Telegram heeft de melding niet bevestigd (HTTP ' + response.status + ')');
  return result.result.message_id;
}

async function saveState(filename, state) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename + '.tmp', JSON.stringify(state));
  await fs.rename(filename + '.tmp', filename);
}

export async function run({ env = process.env, fetcher = fetch, now = Date.now(), log = console.log } = {}) {
  const config = JSON.parse(await fs.readFile(path.join(here, 'config.json'), 'utf8'));
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
