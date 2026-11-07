import {assess,authenticityAssessment,identifyBrand,listingUrl,normalize,sendTelegram} from '../../tools/deal-radar/scoring.mjs';
import {garmentType} from '../../tools/deal-radar/valuation.mjs';

// null in the public status means no per-trial notice cap. Delivery deduplication remains active.
export const MAX_RESEARCH_NOTICES = null;
const sql=(env,query,...args)=>env.RADAR_DB.prepare(query).bind(...args);
const plain=(text,max=140)=>String(text||'').replace(/(?:https?:\/\/|www\.)\S+/gi,'').replace(/\s+/g,' ').trim().slice(0,max);

// This route identifies items worth investigating, never a resale value or authenticity approval.
export function researchCandidate(item,config,now=Date.now()) {
  const brand=identifyBrand(item.brand,config),type=garmentType(item.title);
  if(!brand||!config.coreBrands.includes(brand)||!type)return null;
  if(!['new_with_tags','new_without_tags','very_good','good'].includes(item.condition)||item.flaws?.length)return null;
  const text=normalize(item.title+' '+(item.description||''));
  if(!text.includes(normalize(brand)))return null; // A misfilled brand field alone is insufficient.
  if(/\b(uniqlo|gu|baby|babies|kids|child|children|bimba|bimbo|enfant|garcon|fille|kinder|maanden|months)\b/.test(text))return null;
  const authenticity=authenticityAssessment(item,config,now);
  if(!['unreviewed','reviewed_supported'].includes(authenticity.state))return null;
  const check=assess(item,{...config,authenticityRequiredBrands:[]},now);
  if(check.reason!=='Geen passende prijsreferentie: flipwaarde blijft onbekend')return null;
  const photos=item.photoUrls||[];
  if(photos.length<2)return null;
  const distinctive=/\b(track|painter|velour|velvet|bandana|boro|sashiko|kountry|rebuild|jogging)\b/.test(text);
  return {type,reason:'model_reference_missing',priority:Number(distinctive)*2+Number(photos.length>=4)*3+Number(item.price<=35)+Number(item.condition!=='good')};
}

export function researchText(item,screen) {
  const photo=screen.state==='visually_consistent'
    ? 'Fotoanalyse: kledingstuk en leesbare labels lijken samenhangend; dit bewijst geen authenticiteit.'
    : 'Fotoanalyse: onvoldoende leesbaar merk- of waslabel. Vraag duidelijke labelfoto’s op.';
  return ['ONDERZOEK — GEEN KOOPADVIES',plain(item.title),`${plain(item.brand,60)} · €${item.price.toFixed(2)} · Maat ${plain(item.size,30)||'onbekend'}`,
    'Interessant kledingtype binnen de merkselectie, maar er ontbreekt een passende prijsreferentie.',
    'Verkoopwaarde en marge: onbekend. Authenticiteit: niet bevestigd.',photo,
    'Platformmaat en dames-/herencategorie zijn indicatief; controleer afmetingen en werkelijke pasvorm.',
    'Controleer eerst model, labels, gebreken en maten; onderzoek daarna vergelijkbare verkopen.',listingUrl(item.url)].join('\n');
}

export async function queueResearch(env,item,candidate,policy,now) {
  const id=/\/items\/(\d+)/.exec(listingUrl(item.url)||'')?.[1];
  if(!id)return null;
  // No seller/account data. This private queue is not exposed by the public status endpoint.
  const data=JSON.stringify({url:listingUrl(item.url),title:plain(item.title),brand:item.brand,price:item.price,size:plain(item.size),condition:item.condition,photoUrls:item.photoUrls,reason:candidate.reason});
  const row=await sql(env,"INSERT INTO radar_research (pilot_id,item_id,data,priority,state,first_seen,last_seen) VALUES (?,?,?,?,'queued',?,?) ON CONFLICT(pilot_id,item_id) DO UPDATE SET data=excluded.data,priority=excluded.priority,last_seen=excluded.last_seen RETURNING state",policy.id,id,data,candidate.priority,now,now).first();
  return {id,state:row.state};
}

export async function processResearch(env,item,candidate,policy,{now,clock,fetcher,screen,mayScreen=()=>true}) {
  const queued=await queueResearch(env,item,candidate,policy,now);
  if(!queued||['notified','rejected','notification_pending'].includes(queued.state))return {queued:!!queued,sent:false};
  if(!mayScreen())return {queued:true,sent:false};
  const photo=await screen();
  const state=photo?.state==='rejected'?'rejected':photo?.state==='visually_consistent'?'review_ready':
    photo?.state==='inconclusive'&&photo.reason==='missing_or_unreadable_evidence'?'needs_labels':'queued';
  await sql(env,'UPDATE radar_research SET state=?,photo_state=? WHERE pilot_id=? AND item_id=?',state,photo?.state||null,policy.id,queued.id).run();
  if(!['review_ready','needs_labels'].includes(state)||clock()>=Date.parse(policy.endsAt)||clock()<Date.parse(policy.startsAt))return {queued:true,sent:false,photo};
  // Share the prior photo-review delivery key: an item does not receive a second human-review alert.
  const alertId='photo-review:'+queued.id;
  const claim=await sql(env,"INSERT OR IGNORE INTO radar_alerts (pilot_id,item_id,price,delivery,attempted_at) VALUES (?,?,?,'pending',?) RETURNING item_id",policy.id,alertId,item.price,now).first();
  if(!claim)return {queued:true,sent:false,photo};
  await sql(env,'INSERT OR IGNORE INTO radar_research_limits (pilot_id) VALUES (?)',policy.id).run();
  // Retain the historical attempt counter without limiting future notices.
  await sql(env,'UPDATE radar_research_limits SET attempts=attempts+1 WHERE pilot_id=?',policy.id).run();
  await sql(env,"UPDATE radar_research SET state='notification_pending' WHERE pilot_id=? AND item_id=?",policy.id,queued.id).run();
  const messageId=await sendTelegram(researchText(item,photo),env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_CHAT_ID,fetcher);
  await sql(env,"UPDATE radar_alerts SET delivery='sent',message_id=? WHERE pilot_id=? AND item_id=?",messageId,policy.id,alertId).run();
  await sql(env,"UPDATE radar_research SET state='notified' WHERE pilot_id=? AND item_id=?",policy.id,queued.id).run();
  return {queued:true,sent:true,photo};
}
