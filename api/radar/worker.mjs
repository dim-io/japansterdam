import config from '../../tools/deal-radar/config.json' with { type: 'json' };
import settings from '../../tools/deal-radar/pilot.json' with { type: 'json' };
import { probe } from '../../tools/deal-radar/provider.mjs';
import { assess, alertText, identifyBrand, sendTelegram } from '../../tools/deal-radar/scoring.mjs';
import { screenPhotos, reviewMessage, MAX_VISION_CALLS } from './vision.mjs';
import { estimateFromShop, missingReferenceReason } from '../../tools/deal-radar/valuation.mjs';

export const PILOT_ID = 'pilot-2026-11-04';
export function inWindow(now, policy = settings) {
  const start = Date.parse(policy.startsAt), end = Date.parse(policy.endsAt);
  return policy.enabled && Number.isInteger(policy.maxAttempts) && policy.maxAttempts > 0 && policy.maxAttempts <= 25
    && Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 86400000 && now >= start && now < end;
}
const sql = (env, query, ...args) => env.RADAR_DB.prepare(query).bind(...args);

export async function scan(env, { now = Date.now(), fetcher = fetch, probeFn = probe, authenticityReviews = config.authenticityReviews, policy = settings, clock = Date.now } = {}) {
  // No credentials, database writes or provider requests outside the existing window.
  if (!inWindow(now, policy)) return { inactive: true };
  if (!env.APIFY_TOKEN || !/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN || '') || !/^\d+$/.test(env.TELEGRAM_CHAT_ID || '')) {
    throw new Error('Radarconfiguratie ontbreekt');
  }
  const slot = Math.floor(now / 3600000);
  const previous = await sql(env, 'SELECT * FROM radar_control WHERE id = ?', PILOT_ID).first();
  if (!previous) throw new Error('Radarstatus niet overgezet; scanner blijft gestopt');
  await sql(env, 'UPDATE radar_control SET last_wake_at = ? WHERE id = ?', now, PILOT_ID).run();
  if ((previous.last_slot >= slot && !previous.transport_retry) || previous.attempts >= Math.min(policy.maxAttempts, 25)) return { skipped: true };
  // Validate the source before reserving/spending a scan. Retrying a failed inventory read is free of Apify calls.
  // Read only the public catalog fields already used by the storefront.
  // This avoids Worker-to-Worker fetch restrictions and parsing image-heavy descriptions.
  const catalog = await env.RADAR_DB.prepare("SELECT json_extract(data,'$.name') AS name, json_extract(data,'$.brand') AS brand, json_extract(data,'$.price') AS price FROM products").all();
  const products = catalog.results;
  if (!Array.isArray(products) || !products.length) throw new Error('Shopreferenties ontbreken');
  if (!inWindow(clock(), policy)) return { inactive: true };
  // Atomic database reservation: overlapping events and redeployments cannot spend twice in one hour.
  const reservation = await sql(env,
    'UPDATE radar_control SET attempts = attempts + 1, last_slot = ?, last_attempt_at = ?, transport_retry=0, last_error=NULL, error_at=NULL WHERE id = ? AND (last_slot < ? OR transport_retry=1) AND attempts < ? RETURNING attempts',
    slot, now, PILOT_ID, slot, Math.min(policy.maxAttempts, 25)).first();
  if (!reservation) return { skipped: true };
  const brands = Object.entries(policy.brands);
  const [selectedBrand, brandId] = brands[(reservation.attempts - 1) % brands.length];
  let result;
  try { result = await probeFn({ token: env.APIFY_TOKEN, brandIds: brandId, fetcher }); }
  catch { throw new Error('RADAR_PROVIDER_FAILED'); }
  const items = [...new Map(result.items.filter((item) => identifyBrand(item.brand, config) === identifyBrand(selectedBrand, config)).map((item) => [item.url, item])).values()];
  let newListings = 0, sent = 0, photoReviewSent = 0;
  const decisions = [];
  for (const item of items) {
    const id = /\/items\/(\d+)/.exec(item.url)?.[1];
    if (!id) continue;
    const seen = await sql(env, 'SELECT price FROM radar_seen WHERE pilot_id = ? AND item_id = ?', PILOT_ID, id).first();
    if (!seen) newListings++;
    await sql(env, 'INSERT INTO radar_seen (pilot_id, item_id, price, observed_at) VALUES (?, ?, ?, ?) ON CONFLICT(pilot_id,item_id) DO UPDATE SET price=excluded.price, observed_at=excluded.observed_at', PILOT_ID, id, item.price, now).run();
    const valuation = estimateFromShop(item, products, config);
    let deal = assess({ ...item, ...(valuation ? { valuation } : {}) }, { ...config, authenticityReviews }, now);
    let photoScreen = null;
    // Only spend GPU quota on financially interesting, otherwise valid candidates.
    // AI screening never writes a trusted authentication approval.
    if (deal.authenticity?.state === 'unreviewed' && valuation && env.VISION_FREE_CONFIRMED === 'true') {
      const preliminary = assess({ ...item, valuation }, { ...config, authenticityRequiredBrands: [], authenticityReviews }, now);
      if (preliminary.eligible) {
        const ready = await sql(env, 'SELECT smoke_ok FROM radar_vision_control WHERE id=?', PILOT_ID).first();
        if (ready?.smoke_ok === 1) photoScreen = await screenPhotos(env, item, config, policy, {now,fetcher,clock});
        if (photoScreen?.state === 'visually_consistent' && inWindow(clock(), policy)) {
          const reviewId = 'photo-review:' + id;
          const reserve = await sql(env, "INSERT OR IGNORE INTO radar_alerts (pilot_id,item_id,price,delivery,attempted_at) VALUES (?,?,?,'pending',?) RETURNING item_id", PILOT_ID, reviewId, item.price, now).first();
          if (reserve) {
            const messageId = await sendTelegram(reviewMessage(item,photoScreen),env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_CHAT_ID,fetcher);
            await sql(env,"UPDATE radar_alerts SET delivery='sent',message_id=? WHERE pilot_id=? AND item_id=?",messageId,PILOT_ID,reviewId).run();
            photoReviewSent++;
          }
        }
      }
    }
    if (deal.reason === 'Geen passende prijsreferentie: flipwaarde blijft onbekend') deal.reason = missingReferenceReason(item, products, config);
    decisions.push({ photoScreening: photoScreen?.state || null, authenticity: deal.authenticity?.state || 'not_assessed', photoCount: item.photoUrls?.length || 0, title: item.title, price: item.price, score: deal.score ?? null, reason: deal.reason });
    if (!deal.eligible || !inWindow(clock(), policy)) continue;
    // Reserve delivery before sending. An ambiguous failure is not retried automatically.
    const delivery = await sql(env,
      "INSERT INTO radar_alerts (pilot_id,item_id,price,delivery,attempted_at) VALUES (?,?,?,'pending',?) ON CONFLICT(pilot_id,item_id) DO UPDATE SET price=excluded.price, delivery='pending', message_id=NULL, attempted_at=excluded.attempted_at WHERE excluded.price <= radar_alerts.price * 0.8 RETURNING item_id",
      PILOT_ID, id, item.price, now).first();
    if (!delivery) continue;
    const messageId = await sendTelegram('RADARPROEF — KANDIDAAT OP BASIS VAN SCHATTING\n\n' + alertText(deal), env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, fetcher);
    await sql(env, "UPDATE radar_alerts SET delivery='sent', message_id=? WHERE pilot_id=? AND item_id=?", messageId, PILOT_ID, id).run();
    sent++;
  }
  const report = { scheduler: 'cloudflare', scannedAt: new Date(now).toISOString(), attempts: reservation.attempts,
    selectedBrand, checked: items.length, newListings, repeatedListings: items.length - newListings,
    sent, photoReviewSent, priced: decisions.filter((d) => d.score !== null).length, runId: result.runId, decisions };
  await sql(env, 'UPDATE radar_control SET last_scan_at=?, last_report=?, last_error=NULL, error_at=NULL WHERE id=?',
    now, JSON.stringify(report), PILOT_ID).run();
  console.log(JSON.stringify(report));
  return report;
}

export async function wake(env, options = {}) {
  try {
    const checkTime = options.now ?? Date.now(), policy = options.policy ?? settings;
    if (inWindow(checkTime,policy) && env.VISION_FREE_CONFIRMED === 'true') {
      await screenPhotos(env,{brand:'Kapital'},config,policy,{now:checkTime,smoke:true});
    }
    return await scan(env, options);
  }
  catch (error) {
    const code = ['RADAR_INVENTORY_FAILED', 'RADAR_PROVIDER_FAILED'].includes(error.message) ? error.message : 'RADAR_RUNTIME_FAILED';
    // Never persist arbitrary provider exceptions: their text may contain credentials.
    if (inWindow(options.now ?? Date.now(), options.policy)) {
      await sql(env, "UPDATE radar_control SET last_error=?, error_at=? WHERE id=?", 'Scan niet voltooid: ' + code, options.now ?? Date.now(), PILOT_ID).run();
    }
    console.error(code);
    throw new Error('Radarcontrole niet voltooid');
  }
}

export async function status(env, now = Date.now()) {
  const row = await sql(env, 'SELECT * FROM radar_control WHERE id=?', PILOT_ID).first();
  const vision = await sql(env,'SELECT attempts,smoke_ok,last_outcome FROM radar_vision_control WHERE id=?',PILOT_ID).first();
  const report = row?.last_report ? JSON.parse(row.last_report) : null;
  return { scheduler: 'cloudflare', assessmentPolicy: 'auth-review-required-v1', automaticPhotoAnalysis: env.VISION_FREE_CONFIRMED === 'true' && vision?.smoke_ok === 1,
    photoAnalysisState: env.VISION_FREE_CONFIRMED !== 'true' ? 'free_plan_not_confirmed' : vision?.last_outcome || 'smoke_pending',
    photoChecksUsed: vision?.attempts ?? 0, photoChecksLimit: MAX_VISION_CALLS,
    bundleCheck: 'planned_not_active', active: inWindow(now), endsAt: settings.endsAt,
    lastWakeAt: row?.last_wake_at ? new Date(row.last_wake_at).toISOString() : null,
    lastScanAt: row?.last_scan_at ? new Date(row.last_scan_at).toISOString() : null,
    attempts: row?.attempts ?? null, limit: Math.min(settings.maxAttempts, 25),
    selectedBrand: report?.selectedBrand ?? null, checked: report?.checked ?? null,
    newListings: report?.newListings ?? null, sentLastScan: report?.sent ?? null,
    error: row?.last_error ?? null, errorAt: row?.error_at ? new Date(row.error_at).toISOString() : null,
    overdue: inWindow(now) && (!row?.last_scan_at || now - row.last_scan_at > 90 * 60000),
    note: 'Status bevat geen advertenties, persoonsgegevens of sleutels. Elke vijf minuten wakker, maximaal één scan per UTC-uur.' };
}

export default {
  async scheduled(_event, env) { await wake(env); },
  async fetch(request, env) {
    if (request.method !== 'GET' || !['/', '/status'].includes(new URL(request.url).pathname)) return new Response('Not found', { status: 404 });
    try { return Response.json(await status(env), { headers: { 'Cache-Control': 'no-store' } }); }
    catch { return Response.json({ scheduler: 'cloudflare', error: 'Status tijdelijk niet beschikbaar' }, { status: 503 }); }
  },
};
