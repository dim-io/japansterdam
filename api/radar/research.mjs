import {curation} from './curation.mjs';
import {assess,authenticityAssessment,identifyBrand,listingUrl,normalize,sendTelegram} from '../../tools/deal-radar/scoring.mjs';
import {garmentType} from '../../tools/deal-radar/valuation.mjs';

// null in the public status means no per-trial notice cap. Delivery deduplication remains active.
export const MAX_RESEARCH_NOTICES = null;
const sql=(env,query,...args)=>env.RADAR_DB.prepare(query).bind(...args);
const plain=(text,max=140)=>String(text||'').replace(/(?:https?:\/\/|www\.)\S+/gi,'').replace(/\s+/g,' ').trim().slice(0,max);

// This route identifies items worth investigating, never a resale value or authenticity approval.
export function researchCandidate(item,config,now=Date.now(),{forBundle=false}={}) {
  const id=/\/items\/(\d+)/.exec(listingUrl(item.url)||'')?.[1];
  if(config.researchExcludedItems?.[id])return null;
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
  const preference=curation(item,config);
  if(!preference.allowed&&!forBundle)return null;
  if(!preference.allowed&&!preference.track)return null;
  const distinctive=/\b(track|painter|velour|velvet|bandana|boro|sashiko|kountry|rebuild|jogging)\b/.test(text);
  return {type,reason:'model_reference_missing',curationReason:preference.reason,priority:preference.boost+Number(distinctive)*2+Number(photos.length>=4)*3+Number(item.price<=35)+Number(item.condition!=='good')};
}

export function researchText(item,screen,candidate={}) {
  const photo=screen?.state==='visually_consistent'
    ? 'Fotoanalyse: kledingstuk en leesbare labels lijken samenhangend; dit bewijst geen authenticiteit.'
    : screen?.state==='inconclusive'&&screen.reason==='missing_or_unreadable_evidence'
    ? 'Fotoanalyse: onvoldoende leesbaar merk- of waslabel. Vraag duidelijke labelfoto’s op.'
    : 'Nog niet visueel gecontroleerd — onderzoekskandidaat. Controleer zelf kledingstuk, merklabel en waslabel.';
  return ['ONDERZOEK — GEEN KOOPADVIES',plain(item.title),`${plain(item.brand,60)} · €${item.price.toFixed(2)} · Maat ${plain(item.size,30)||'onbekend'}`,
    'Kandidaat binnen jouw selectie; model, uitvoering en vraagprijs verdienen nader onderzoek. Een passende prijsreferentie ontbreekt.',
    ...(candidate.curationReason==='preferred_needles_garment'?['Selectie: een van jouw voorkeurscategorieën van Needles; beoordeel de specifieke uitvoering.']:[]),
    'Verkoopwaarde en marge: onbekend. Authenticiteit: niet bevestigd.',photo,
    'Platformmaat en dames-/herencategorie zijn indicatief; controleer afmetingen en werkelijke pasvorm.',
    'Controleer eerst model, labels, gebreken en maten; onderzoek daarna vergelijkbare verkopen.',listingUrl(item.url)].join('\n');
}

export async function queueResearchBatch(env,rows,policy,now) {
  const entries=rows.map(({item,candidate})=>{
    const id=/\/items\/(\d+)/.exec(listingUrl(item.url)||'')?.[1];
    if(!id)return null;
    // No seller/account data; the private queue is never exposed in public status.
    const data=JSON.stringify({url:listingUrl(item.url),title:plain(item.title),brand:item.brand,price:item.price,size:plain(item.size),condition:item.condition,description:plain(item.description,5000),photoUrls:item.photoUrls,reason:candidate.reason});
    return [policy.id,id,data,candidate.priority,now,now];
  }).filter(Boolean);
  if(!entries.length)return new Map();
  const values=entries.map(()=>"(?,?,?,?,'queued',?,?)").join(',');
  const result=await sql(env,`INSERT INTO radar_research (pilot_id,item_id,data,priority,state,first_seen,last_seen) VALUES ${values} ON CONFLICT(pilot_id,item_id) DO UPDATE SET data=excluded.data,priority=excluded.priority,last_seen=excluded.last_seen RETURNING item_id,state`,...entries.flat()).all();
  return new Map(result.results.map(row=>[row.item_id,{id:row.item_id,state:row.state}]));
}
export async function queueResearch(env,item,candidate,policy,now) {
  const rows=await queueResearchBatch(env,[{item,candidate}],policy,now);
  return [...rows.values()][0]||null;
}

export async function processResearch(env,item,candidate,policy,{now,clock,fetcher,screen,mayScreen=()=>true,maySend=()=>true,queued:existingQueue}) {
  const queued=existingQueue||await queueResearch(env,item,candidate,policy,now);
  if(!queued||['notified','rejected','notification_pending'].includes(queued.state))return {queued:!!queued,sent:false};
  if(!maySend())return {queued:true,sent:false};
  const photo=mayScreen()?await screen():{state:'unreviewed',reason:'photo_check_not_run'};
  const state=photo?.state==='rejected'?'rejected':photo?.state==='visually_consistent'?'review_ready':
    photo?.state==='inconclusive'&&photo.reason==='missing_or_unreadable_evidence'?'needs_labels':'unreviewed';
  await sql(env,'UPDATE radar_research SET state=?,photo_state=? WHERE pilot_id=? AND item_id=?',state,photo?.state||null,policy.id,queued.id).run();
  if(!maySend()||!['review_ready','needs_labels','unreviewed'].includes(state)||clock()>=Date.parse(policy.endsAt)||clock()<Date.parse(policy.startsAt))return {queued:true,sent:false,photo};
  // Share the prior photo-review delivery key: an item does not receive a second human-review alert.
  const alertId='photo-review:'+queued.id;
  const claim=await sql(env,"INSERT INTO radar_alerts (pilot_id,item_id,price,delivery,attempted_at) VALUES (?,?,?,'pending',?) ON CONFLICT(pilot_id,item_id) DO UPDATE SET price=excluded.price,delivery='pending',attempted_at=excluded.attempted_at WHERE radar_alerts.delivery='skipped' RETURNING item_id",policy.id,alertId,item.price,now).first();
  if(!claim)return {queued:true,sent:false,photo};
  // Retain the historical attempt counter without limiting future notices.
  await sql(env,'INSERT INTO radar_research_limits (pilot_id,attempts) VALUES (?,1) ON CONFLICT(pilot_id) DO UPDATE SET attempts=attempts+1',policy.id).run();
  await sql(env,"UPDATE radar_research SET state='notification_pending' WHERE pilot_id=? AND item_id=?",policy.id,queued.id).run();
  const messageId=await sendTelegram(researchText(item,photo,candidate),env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_CHAT_ID,fetcher);
  await sql(env,"UPDATE radar_alerts SET delivery='sent',message_id=? WHERE pilot_id=? AND item_id=?",messageId,policy.id,alertId).run();
  await sql(env,"UPDATE radar_research SET state='notified' WHERE pilot_id=? AND item_id=?",policy.id,queued.id).run();
  return {queued:true,sent:true,photo};
}
