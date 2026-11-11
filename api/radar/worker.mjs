import {curation} from './curation.mjs';
import {queueBestBundle,checkNextBundle} from './bundles.mjs';
import {readCatalog} from './catalog.mjs';
import readinessPolicy from './owner-readiness.json' with {type:'json'};
import {runResearchTest} from './research-test.mjs';
import {researchCandidate,processResearch,queueResearchBatch,MAX_RESEARCH_NOTICES} from './research.mjs';
import config from '../../tools/deal-radar/config.json' with { type: 'json' };
import settings from '../../tools/deal-radar/pilot-v3.json' with { type: 'json' };
import { preflight } from '../../tools/deal-radar/budget.mjs';
import { compareCatalog } from './freshness.mjs';
import { probe } from '../../tools/deal-radar/provider.mjs';
import { assess, alertText, identifyBrand, itemPriceLimit, sendTelegram } from '../../tools/deal-radar/scoring.mjs';
import { screenPhotos, reviewMessage, MAX_VISION_CALLS } from './vision.mjs';
import { estimateFromShop, missingReferenceReason } from '../../tools/deal-radar/valuation.mjs';

export const PILOT_ID = 'pilot-2026-11-04';
export function inWindow(now, policy = settings) {
  const start = Date.parse(policy.startsAt), end = Date.parse(policy.endsAt);
  return policy.enabled && Number.isInteger(policy.maxAttempts) && policy.maxAttempts > 0 && policy.maxAttempts <= 25
    && Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 86400000 && now >= start && now < end;
}
const sql = (env, query, ...args) => env.RADAR_DB.prepare(query).bind(...args);
const boundedMode=policy=>['both-brands','rotating-brands'].includes(policy.mode);
export function scanSelection(policy,slot,attempts=1){
  const brands=Object.entries(policy.brands);
  if(policy.mode==='rotating-brands'){
    const groups=policy.brandGroups;
    if(!Array.isArray(groups)||groups.length!==2||groups.some(g=>!Array.isArray(g)||g.length!==2)
      ||new Set(groups.flat()).size!==4||groups.flat().some(b=>!policy.brands[b])||brands.length!==4)throw Error('Ongeldig merkschema');
    return groups[slot%groups.length].map(b=>[b,policy.brands[b]]);
  }
  return policy.mode==='both-brands'?brands:[brands[(attempts-1)%brands.length]];
}

export async function scan(env, { now = Date.now(), fetcher = fetch, probeFn = probe, authenticityReviews = config.authenticityReviews, policy = settings, clock = Date.now } = {}) {
  // No credentials, database writes or provider requests outside the existing window.
  if (!inWindow(now, policy)) return { inactive: true };
  if (!env.APIFY_TOKEN || !/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN || '') || !/^\d+$/.test(env.TELEGRAM_CHAT_ID || '')) {
    throw new Error('Radarconfiguratie ontbreekt');
  }
  const pilotId = policy.id || PILOT_ID;
  const slot = Math.floor((now - (boundedMode(policy) ? Date.parse(policy.startsAt) : 0)) / 3600000);
  if(policy.mode==='rotating-brands')scanSelection(policy,slot);
  const previous = await sql(env, 'SELECT * FROM radar_control WHERE id = ?', pilotId).first();
  if (!previous) throw new Error('Radarstatus niet overgezet; scanner blijft gestopt');
  await sql(env, 'UPDATE radar_control SET last_wake_at = ? WHERE id = ?', now, pilotId).run();
  if ((previous.last_slot >= slot && !previous.transport_retry) || previous.attempts >= Math.min(policy.maxAttempts, 25)) return { skipped: true };
  // Validate the source before reserving/spending a scan. Retrying a failed inventory read is free of Apify calls.
  // Across accounts, read current public references without shop database access.
  const products = await readCatalog(env, fetcher);
  if (!Array.isArray(products) || !products.length) throw new Error('Shopreferenties ontbreken');
  if (!inWindow(clock(), policy)) return { inactive: true };
  if (boundedMode(policy)) {
    const budget = await preflight(env.APIFY_TOKEN, fetcher, previous.attempts === 0 ? (policy.bundleChecks?.enabled?1.81:1.69) : .31);
    if (!budget.enoughCredit) throw new Error('RADAR_BUDGET_BLOCKED');
  }
  // Atomic database reservation: overlapping events and redeployments cannot spend twice in one hour.
  const reservation = await sql(env,
    'UPDATE radar_control SET attempts = attempts + 1, last_slot = ?, last_attempt_at = ?, transport_retry=0, last_error=NULL, error_at=NULL WHERE id = ? AND (last_slot < ? OR transport_retry=1) AND attempts < ? RETURNING attempts',
    slot, now, pilotId, slot, Math.min(policy.maxAttempts, 25)).first();
  if (!reservation) return { skipped: true };
  const selection = scanSelection(policy,slot,reservation.attempts);
  const selectedBrand = selection.map(([brand]) => brand).join(' + ');
  const results = [];
  for (const [brand, brandId] of selection) {
    if (!inWindow(clock(), policy)) break;
    try {
      const source = await probeFn({ token: env.APIFY_TOKEN, brandIds: brandId, fetcher,
        ...(boundedMode(policy) ? {maxResults:10,maxCostUsd:.03} : {}),maxPrice:itemPriceLimit(brand,config) });
      const items = source.items.filter((item) => identifyBrand(item.brand,config) === identifyBrand(brand,config));
      const freshness = boundedMode(policy) && reservation.attempts === 1
        ? await compareCatalog(brandId,items,fetcher,itemPriceLimit(brand,config)) : null;
      results.push({...source,items,brand,freshness});
    } catch { throw new Error('RADAR_PROVIDER_FAILED'); }
  }
  const result = {runId:results.map((r)=>r.runId).join(',')};
  const items = [...new Map(results.flatMap((r)=>r.items).map((item)=>[item.url,item])).values()];
  let newListings = 0, sent = 0, photoReviewSent = 0, researchQueued = 0, researchSent = 0;
  const researchConfig={...config,authenticityReviews};
  // In the bundle pilot, keep the limited model-reading budget for paired label checks.
  let photoChecksLeft=policy.bundleChecks?.reservePhotoChecks?0:1;
  const research=new Map();
  const ids=items.map((item)=>/\/items\/(\d+)/.exec(item.url)?.[1]).filter(Boolean);
  const seenIds=new Set();
  if(ids.length) {
    const placeholders=ids.map(()=>'?').join(',');
    const seen=await sql(env,`SELECT item_id FROM radar_seen WHERE pilot_id=? AND item_id IN (${placeholders})`,pilotId,...ids).all();
    seen.results.forEach((row)=>seenIds.add(row.item_id));
    const values=ids.map(()=>'(?,?,?,?)').join(',');
    const rows=items.filter((item)=>/\/items\/(\d+)/.test(item.url));
    await sql(env,`INSERT INTO radar_seen (pilot_id,item_id,price,observed_at) VALUES ${values} ON CONFLICT(pilot_id,item_id) DO UPDATE SET price=excluded.price, observed_at=excluded.observed_at`,...rows.flatMap((item)=>[pilotId,/\/items\/(\d+)/.exec(item.url)[1],item.price,now])).run();
  }
  if(policy.researchEnabled) {
    const previousResearch=await sql(env,'SELECT item_id,state FROM radar_research WHERE pilot_id=?',pilotId).all();
    const finished=new Set(previousResearch.results.filter((row)=>['notified','rejected','notification_pending'].includes(row.state)).map((row)=>row.item_id));
    for(const item of items) {
      if(!finished.has(/\/items\/(\d+)/.exec(item.url)?.[1])&&!estimateFromShop(item,products,config)) {
        const candidate=researchCandidate(item,researchConfig,now);
        if(candidate)research.set(item.url,candidate);
      }
    }
    // Priced strong candidates retain first use of the shared photo budget.
    const priority=(item)=>{
      const valuation=estimateFromShop(item,products,config);
      if(valuation&&assess({...item,valuation},{...researchConfig,authenticityRequiredBrands:[]},now).eligible)return 100;
      return research.get(item.url)?.priority||0;
    };
    items.sort((a,b)=>priority(b)-priority(a));
    const selected=new Set([...research].sort((a,b)=>b[1].priority-a[1].priority).slice(0,5).map(([url])=>url));
    for(const url of research.keys())if(!selected.has(url))research.delete(url);
  }
  const bundlesQueued=await queueBestBundle(env,items,researchConfig,policy,now);
  const queuedResearch=await queueResearchBatch(env,items.filter(item=>research.has(item.url)).map(item=>({item,candidate:research.get(item.url)})),policy,now);
  const decisions = [];
  for (const item of items) {
    const id = /\/items\/(\d+)/.exec(item.url)?.[1];
    if (!id) continue;
    if (!seenIds.has(id)) newListings++;
    const valuation = estimateFromShop(item, products, config);
    let deal = assess({ ...item, ...(valuation ? { valuation } : {}) }, { ...config, authenticityReviews }, now);
    const preference=curation(item,config);
    if(!preference.allowed)deal={...deal,eligible:false,reason:preference.reason};
    let photoScreen = null;
    // Only spend GPU quota on financially interesting, otherwise valid candidates.
    // AI screening never writes a trusted authentication approval.
    if (preference.allowed && deal.authenticity?.state === 'unreviewed' && valuation && env.VISION_FREE_CONFIRMED === 'true') {
      const preliminary = assess({ ...item, valuation }, { ...config, authenticityRequiredBrands: [], authenticityReviews }, now);
      if (preliminary.eligible && photoChecksLeft>0) {
        const ready = await sql(env, 'SELECT smoke_ok FROM radar_vision_control WHERE id=?', pilotId).first();
        if (ready?.smoke_ok === 1) {photoChecksLeft--;photoScreen = await screenPhotos(env, item, config, policy, {now,fetcher,clock});}
        if (photoScreen?.state === 'visually_consistent' && sent+photoReviewSent+researchSent<2 && inWindow(clock(), policy)) {
          const reviewId = 'photo-review:' + id;
          const reserve = await sql(env, "INSERT OR IGNORE INTO radar_alerts (pilot_id,item_id,price,delivery,attempted_at) VALUES (?,?,?,'pending',?) RETURNING item_id", pilotId, reviewId, item.price, now).first();
          if (reserve) {
            const messageId = await sendTelegram(reviewMessage(item,photoScreen),env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_CHAT_ID,fetcher);
            await sql(env,"UPDATE radar_alerts SET delivery='sent',message_id=? WHERE pilot_id=? AND item_id=?",messageId,pilotId,reviewId).run();
            photoReviewSent++;
          }
        }
      }
    }
    const candidate=research.get(item.url);
    if(candidate) {
      const outcome=await processResearch(env,item,candidate,policy,{now,clock,fetcher,queued:queuedResearch.get(id),mayScreen:()=>photoChecksLeft>0&&sent+photoReviewSent+researchSent<2,maySend:()=>sent+photoReviewSent+researchSent<2,
        screen:async()=>{
          photoChecksLeft--;
          const ready=await sql(env,'SELECT smoke_ok FROM radar_vision_control WHERE id=?',pilotId).first();
          return ready?.smoke_ok===1?screenPhotos(env,item,researchConfig,policy,{now,fetcher,clock}):{state:'disabled',reason:'smoke_pending'};
        }});
      researchQueued+=Number(outcome.queued);researchSent+=Number(outcome.sent);
      if(outcome.photo)photoScreen=outcome.photo;
    }
    if (deal.reason === 'Geen passende prijsreferentie: flipwaarde blijft onbekend') deal.reason = missingReferenceReason(item, products, config);
    decisions.push({ photoScreening: photoScreen?.state || null, authenticity: deal.authenticity?.state || 'not_assessed', photoCount: item.photoUrls?.length || 0, title: item.title, price: item.price, score: deal.score ?? null, reason: deal.reason });
    if (!deal.eligible || sent+photoReviewSent+researchSent>=2 || !inWindow(clock(), policy)) continue;
    // Reserve delivery before sending. An ambiguous failure is not retried automatically.
    const delivery = await sql(env,
      "INSERT INTO radar_alerts (pilot_id,item_id,price,delivery,attempted_at) VALUES (?,?,?,'pending',?) ON CONFLICT(pilot_id,item_id) DO UPDATE SET price=excluded.price, delivery='pending', message_id=NULL, attempted_at=excluded.attempted_at WHERE excluded.price <= radar_alerts.price * 0.8 RETURNING item_id",
      pilotId, id, item.price, now).first();
    if (!delivery) continue;
    const messageId = await sendTelegram('RADARPROEF — KANDIDAAT OP BASIS VAN SCHATTING\n\n' + alertText(deal), env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, fetcher);
    await sql(env, "UPDATE radar_alerts SET delivery='sent', message_id=? WHERE pilot_id=? AND item_id=?", messageId, pilotId, id).run();
    sent++;
  }
  const report = { scheduler: 'cloudflare', scannedAt: new Date(now).toISOString(), attempts: reservation.attempts,
    selectedBrand, byBrand:results.map((r)=>({brand:r.brand,checked:r.items.length,freshness:r.freshness})), checked: items.length, newListings, repeatedListings: items.length - newListings,
    sent, photoReviewSent, researchQueued, researchSent, bundlesQueued, priced: decisions.filter((d) => d.score !== null).length, runId: result.runId, decisions };
  await sql(env, 'UPDATE radar_control SET last_scan_at=?, last_report=?, last_error=NULL, error_at=NULL WHERE id=?',
    now, JSON.stringify(report), pilotId).run();
  console.log(JSON.stringify({scheduler:report.scheduler,attempts:report.attempts,checked:report.checked,newListings,sent,photoReviewSent,researchQueued,researchSent}));
  return report;
}

export async function wake(env, options = {}) {
  try {
    const checkTime = options.now ?? Date.now(), policy = options.policy ?? settings;
    if(inWindow(checkTime,policy)&&policy.researchTestOnce) {
      const test=await runResearchTest(env,config,policy,{now:checkTime,clock:options.clock||Date.now,fetcher:options.fetcher||fetch});
      if(test)return test;
    }
    if (inWindow(checkTime,policy) && env.VISION_FREE_CONFIRMED === 'true') {
      const ready=await sql(env,'SELECT smoke_ok FROM radar_vision_control WHERE id=?',policy.id || PILOT_ID).first();
      if(ready?.smoke_ok!==1)await screenPhotos(env,{brand:'Kapital'},config,policy,{now:checkTime,smoke:true});
    }
    const result=await scan(env, options);
    // Seller lookups run on idle wakes, never in the same Free request as a full scan.
    if(result.skipped&&inWindow(checkTime,policy))return {...result,...await checkNextBundle(env,config,policy,{now:checkTime,clock:options.clock||Date.now,fetcher:options.fetcher||fetch})};
    return result;
  }
  catch (error) {
    const code = ['RADAR_INVENTORY_FAILED', 'RADAR_PROVIDER_FAILED', 'RADAR_BUDGET_BLOCKED'].includes(error.message) ? error.message : 'RADAR_RUNTIME_FAILED';
    // Never persist arbitrary provider exceptions: their text may contain credentials.
    if (inWindow(options.now ?? Date.now(), options.policy)) {
      await sql(env, "UPDATE radar_control SET last_error=?, error_at=? WHERE id=?", 'Scan niet voltooid: ' + code, options.now ?? Date.now(), (options.policy ? options.policy.id || PILOT_ID : settings.id || PILOT_ID)).run();
    }
    console.error(code);
    throw new Error('Radarcontrole niet voltooid');
  }
}

export async function status(env, now = Date.now(), policy = settings) {
  const pilotId = policy.id || PILOT_ID;
  const row = await sql(env, 'SELECT * FROM radar_control WHERE id=?', pilotId).first();
  const vision = await sql(env,'SELECT attempts,smoke_ok,last_outcome FROM radar_vision_control WHERE id=?',pilotId).first();
  const readiness = await sql(env,'SELECT state,result,created_at FROM radar_photo_checks WHERE pilot_id=? AND item_id=? AND evidence_key=?',readinessPolicy.id,'smoke-v2','empty-pixel-regression-v2').first();
  const readinessResult = readiness?.result ? JSON.parse(readiness.result) : null;
  const report = row?.last_report ? JSON.parse(row.last_report) : null;
  const researchStates=policy.researchEnabled ? (await sql(env,'SELECT state,COUNT(*) AS count FROM radar_research WHERE pilot_id=? GROUP BY state',pilotId).all()).results : [];
  const researchTest=policy.researchTestOnce ? await sql(env,'SELECT state,report FROM radar_research_tests WHERE pilot_id=?',pilotId).first() : null;
  const researchBudget=policy.researchEnabled ? await sql(env,'SELECT attempts FROM radar_research_limits WHERE pilot_id=?',pilotId).first() : null;
  const bundleBudget=policy.bundleChecks?.enabled?await sql(env,'SELECT attempts FROM radar_bundle_limits WHERE pilot_id=?',pilotId).first():null;
  const bundleStates=policy.bundleChecks?.enabled?(await sql(env,'SELECT state,COUNT(*) AS count FROM radar_bundle_checks WHERE pilot_id=? GROUP BY state',pilotId).all()).results:[];
  return { scheduler: 'cloudflare', assessmentPolicy: 'auth-review-required-v1', automaticPhotoAnalysis: env.VISION_FREE_CONFIRMED === 'true' && vision?.smoke_ok === 1,
    researchPhotoCheckRequired:false, photoAnalysisState: env.VISION_FREE_CONFIRMED !== 'true' ? readinessResult?.state==='ready'?'inactive_after_readiness_test':'free_plan_not_confirmed' : vision?.last_outcome || 'smoke_pending',
    readinessTest: readiness ? {state:readinessResult?.state||readiness.state,reason:readinessResult?.reason||null,checkedAt:new Date(readiness.created_at).toISOString()} : null,
    photoChecksUsed: vision?.attempts ?? 0, photoChecksLimit: policy.maxPhotoChecks || MAX_VISION_CALLS,
    trial:pilotId,resultsPerBrand:policy.maxResultsPerBrand || 3,brandsPerHour:boundedMode(policy) ? 2 : 1,
    priceLimits:Object.fromEntries(Object.keys(policy.brands).map(brand=>[brand,itemPriceLimit(brand,config)])),
    brandSchedule:policy.brandGroups||null,scanIntervalHours:policy.mode==='rotating-brands'?2:policy.mode==='both-brands'?1:Object.keys(policy.brands).length,
    byBrand:report?.byBrand || [],
    researchTest:researchTest?.report?JSON.parse(researchTest.report):researchTest?{state:researchTest.state}:null,
    researchEnabled:policy.researchEnabled===true,researchStates,researchNoticeAttempts:researchBudget?.attempts||0,researchNoticeLimit:MAX_RESEARCH_NOTICES,researchSentLastScan:report?.researchSent||0,
    bundleCheck: policy.bundleChecks?.enabled?'bounded_idle_wake_lookup':'inactive',bundleCheckLimit:policy.bundleChecks?.maxAttempts||0,bundleChecksUsed:bundleBudget?.attempts||0,bundleStates, active: inWindow(now,policy), endsAt: policy.endsAt,
    lastWakeAt: row?.last_wake_at ? new Date(row.last_wake_at).toISOString() : null,
    lastScanAt: row?.last_scan_at ? new Date(row.last_scan_at).toISOString() : null,
    attempts: row?.attempts ?? null, limit: Math.min(policy.maxAttempts, 25),
    selectedBrand: report?.selectedBrand ?? null, checked: report?.checked ?? null,
    newListings: report?.newListings ?? null, sentLastScan: report?.sent ?? null, photoReviewSentLastScan:report?.photoReviewSent ?? null,
    error: row?.last_error ?? null, errorAt: row?.error_at ? new Date(row.error_at).toISOString() : null,
    overdue: inWindow(now,policy) && now - (row?.last_scan_at || Date.parse(policy.startsAt)) > 90 * 60000,
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
