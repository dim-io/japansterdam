import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { listingUrl } from './radar.mjs';

const API = 'https://api.apify.com/v2';
const ACTOR = 'omkar-cloud~vinted-scraper';
const MAX_COST = .02;
// Vinted's catalog identifies the fashion label Needles as brand 360271.
// A plain keyword also returns sewing needles and unrelated tagged items.
const INPUT = { searchQueries: ['https://www.vinted.nl/catalog?brand_ids%5B%5D=360271&price_to=40&currency=EUR&order=newest_first'], brandIds: '360271', country: 'nl', sortBy: 'newest_first', maxPrice: 40, maxResults: 3, includeDetails: true, language: 'en' };
const terminal = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);

// Keep missing fields unknown. A successful search is not evidence that a
// returned listing is still available or that it is a profitable deal.
export function normalizeRow(row, observedAt) {
  const url = listingUrl(row.link || row.url);
  const price = typeof row.price === 'number' ? row.price : Number(row.price?.amount);
  const currency = row.currency || row.price?.currency_code;
  if (!url || !Number.isFinite(price) || price <= 0 || price > 40 || currency !== 'EUR') return null;
  const conditions = { 'New with tags': 'new_with_tags', 'New without tags': 'new_without_tags', 'Very good': 'very_good', Good: 'good', Satisfactory: 'satisfactory' };
  const item = { url, title: String(row.title || '').slice(0, 200), brand: String(row.brand || row.brand_title || ''), price, currency,
    size: String(row.size || row.size_title || ''), condition: conditions[row.condition || row.status] || null,
    available: row.availability === 'available' ? true : row.availability ? false : null,
    description: String(row.description || '').slice(0, 5000), observedAt, comparables: [] };
  if (typeof row.shipping_price === 'number' && row.shipping_price >= 0) item.shippingCost = row.shipping_price;
  if (typeof row.buyer_protection_fee === 'number' && row.buyer_protection_fee >= 0) item.buyerFee = row.buyer_protection_fee;
  return item;
}

export async function probe({ token, fetcher = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now() }) {
  if (!token || /\s/.test(token)) throw new Error('Sla eerst je Apify API-token op als GitHub-secret APIFY_TOKEN.');
  const api = async (endpoint, { method = 'GET', body } = {}) => {
    let response;
    try {
      response = await fetcher(API + endpoint, { method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(30_000) });
    } catch { throw new Error('Apify is niet bereikbaar; de proefscan is niet bevestigd. Controleer Runs in Apify vóór opnieuw starten.'); }
    if (!response.ok) throw new Error('Apify gaf HTTP ' + response.status + '. Controleer je token, toegang tot de scraper en gratis tegoed.');
    return response.json();
  };
  const started = await api('/actors/' + ACTOR + '/runs?timeout=90&maxItems=3&maxTotalChargeUsd=' + MAX_COST + '&restartOnError=false', { method: 'POST', body: INPUT });
  let run = started.data;
  if (!run || !/^[A-Za-z0-9]+$/.test(run.id || '')) throw new Error('Apify gaf geen geldig runnummer terug.');
  const deadline = now() + 120_000;
  while (!terminal.has(run.status) && now() < deadline) {
    await sleep(3000);
    const result = await api('/actor-runs/' + run.id);
    run = result.data;
    if (!run || !/^[A-Za-z0-9]+$/.test(run.id || '')) throw new Error('Ongeldige Apify-runstatus.');
  }
  if (!terminal.has(run.status)) {
    await api('/actor-runs/' + run.id + '/abort', { method: 'POST' });
    throw new Error('De proefscan duurde te lang en is afgebroken.');
  }
  if (run.status !== 'SUCCEEDED') throw new Error('De Apify-proefscan eindigde met status ' + run.status + '. Bekijk de run in Apify.');
  if (!/^[A-Za-z0-9]+$/.test(run.defaultDatasetId || '')) throw new Error('Apify gaf geen geldige resultatenset terug.');
  const rows = await api('/datasets/' + run.defaultDatasetId + '/items?clean=true&limit=3&format=json');
  if (!Array.isArray(rows)) throw new Error('Apify gaf geen advertentielijst terug.');
  const observedAt = run.finishedAt || new Date(now()).toISOString();
  const items = rows.slice(0, 3).filter((r) => r && typeof r === 'object').map((r) => normalizeRow(r, observedAt)).filter(Boolean);
  return { runId: run.id, maxCostUsd: MAX_COST, returned: rows.length, items, confirmedAvailable: items.filter((i) => i.available === true).length,
    usageTotalUsd: typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null };
}

const safeText = (value) => String(value).replace(/[\r\n]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_[\]{}|]/g, '\\$&');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await probe({ token: process.env.APIFY_TOKEN });
    console.log(JSON.stringify({ runId: result.runId, returned: result.returned, validUnder40: result.items.length, confirmedAvailable: result.confirmedAvailable, usageTotalUsd: result.usageTotalUsd }));
    const summary = ['## Vinted-proefscan', '', `Apify-run: https://console.apify.com/view/runs/${result.runId}`, '',
      `Aangevraagde kostenlimiet: $${result.maxCostUsd.toFixed(2)}. Maximaal drie resultaten, één merk.`, '',
      `${result.items.length} geldige EUR-advertenties tot €40; ${result.confirmedAvailable} met expliciet bevestigde beschikbaarheid.`, '',
      ...result.items.map((i) => `- **${safeText(i.title)}** · €${i.price.toFixed(2)} · ${safeText(i.brand)} · staat: ${safeText(i.condition || 'onbekend')} · beschikbaar: ${i.available === null ? 'onbekend' : i.available ? 'ja' : 'nee'} · [Bekijk op Vinted](${i.url})`), '',
      '**Dit is alleen een verbindingstest.** Er zijn geen verkoopvergelijkingen opgehaald, geen dealscores berekend en geen koopjesalerts verstuurd. Het uurschema is niet aangezet.', '',
      result.items.length ? 'De ontvangen velden kunnen nu worden gecontroleerd vóór verdere aansluiting.' : 'Geen bruikbare items ontvangen. Dat bewijst niet dat er geen aanbiedingen bestaan; deze bron is nog niet gevalideerd.', '',
    ].join('\n');
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
