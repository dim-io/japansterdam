import {curation} from './curation.mjs';
import {assess,authenticityAssessment,identifyBrand,listingUrl,normalize,sendTelegram} from '../../tools/deal-radar/scoring.mjs';
import {itemType} from '../../tools/deal-radar/valuation.mjs';
import {brandClaimSupported,selectionRejection} from '../../tools/deal-radar/selection.mjs';

// null in the public status means no per-trial notice cap. Delivery deduplication remains active.
export const MAX_RESEARCH_NOTICES = null;
// Telegram highlights should be rare. Strong curator exceptions (the
// Japansterdam story and preferred Porter Tanker line) remain independent.
// A missing shop reference caps normal listing scores at 72 (or 74 for NWT),
// so the former threshold of 85 could never alert on these candidates. Keep
// the alert selective by pairing the attainable score with a bargain ceiling.
export const TELEGRAM_STANDOUT_SCORE = 55;
export const TELEGRAM_STANDOUT_MAX_PRICE = 40;
const sql=(env,query,...args)=>env.RADAR_DB.prepare(query).bind(...args);
const plain=(text,max=140)=>String(text||'').replace(/(?:https?:\/\/|www\.)\S+/gi,'').replace(/\s+/g,' ').trim().slice(0,max);

// This route identifies items worth investigating, never a resale value or authenticity approval.
export function researchAssessment(item,config,now=Date.now(),{forBundle=false}={}) {
  const reject=reason=>({candidate:null,reason});
  const id=/\/items\/(\d+)/.exec(listingUrl(item.url)||'')?.[1];
  if(config.researchExcludedItems?.[id])return reject('explicit_exclusion');
  if(!Number.isFinite(item.price)||item.price<=0)return reject('invalid_price');
  if(item.currency&&item.currency!=='EUR')return reject('unsupported_currency');
  const brand=identifyBrand(item.brand,config),type=itemType(item);
  if(!brand||![...config.coreBrands,...(config.researchBrands||[])].includes(brand))return reject('brand_outside_selection');
  if(!type)return reject('garment_type_unknown');
  if(!['new_with_tags','new_without_tags','very_good','good'].includes(item.condition)||item.flaws?.length)return reject('condition_or_flaws');
  const text=normalize(item.title+' '+(item.description||''));
  if(!brandClaimSupported(item,config)&&item.brandEvidence!=='verified_vinted_brand_filter')return reject('brand_claim_unsupported'); // A verified source filter supports generic titles; a seller field alone does not.
  const selection=selectionRejection(item,config);if(selection)return reject(selection);
  if(/\b(uniqlo|gu|baby|babies|kids|child|children|bimba|bimbo|enfant|garcon|fille|kinder|maanden|months)\b/.test(text))return reject('excluded_collaboration_or_child_item');
  const authenticity=authenticityAssessment(item,config,now);
  if(!['unreviewed','reviewed_supported'].includes(authenticity.state))return reject('authenticity_contradiction');
  const check=assess(item,{...config,authenticityRequiredBrands:[]},now);
  const photos=item.photoUrls||[];
  if(photos.length<2)return reject('insufficient_photos');
  const preference=curation(item,config);
  if(!preference.allowed&&!forBundle)return reject('curation_excluded');
  if(!preference.allowed&&!preference.track)return reject('curation_excluded');
  const curatorReason=['preferred_japanese_story','preferred_porter_tanker','preferred_porter_tanker_green_orange'].includes(preference.reason);
  const highScore=item.dealRating?.state==='scored'&&item.dealRating.score>=TELEGRAM_STANDOUT_SCORE&&item.price<=TELEGRAM_STANDOUT_MAX_PRICE;
  const missingReference=check.reason==='Geen passende prijsreferentie: flipwaarde blijft onbekend';
  if(!check.eligible&&missingReference&&item.available===true&&item.price<=100&&(curatorReason||highScore)){
    return {reason:'research_candidate',candidate:{type,reason:curatorReason?'curator_pick':'high_deal_score',curationReason:preference.reason,
      priority:preference.boost+(highScore?item.dealRating.score:0)+15}};
  }
  if(check.reason!=='Geen passende prijsreferentie: flipwaarde blijft onbekend'){
    if(check.eligible)return reject('priced_candidate');
    return reject(check.reason.includes('prijsgrens')?'price_limit':check.reason.includes('Beschikbaarheid')?'availability_unconfirmed':check.reason.includes('recent genoeg')||check.reason.includes('uploadtijd')?'source_freshness':check.reason.includes('imitatie')?'imitation_language':'financial_or_other_eligibility');
  }
  const distinctive=/\b(track|painter|velour|velvet|bandana|boro|sashiko|kountry|rebuild|jogging)\b/.test(text);
  return {reason:'research_candidate',candidate:{type,reason:'model_reference_missing',curationReason:preference.reason,priority:preference.boost+Number(distinctive)*2+Number(photos.length>=4)*3+Number(item.price<=35)+Number(item.condition!=='good')}};
}
export function researchCandidate(item,config,now=Date.now(),options={}) {
  return researchAssessment(item,config,now,options).candidate;
}

export function researchText(item,screen,candidate={}) {
  const photo=screen?.state==='visually_consistent'
    ? 'Fotoanalyse: kledingstuk en leesbare labels lijken samenhangend; dit bewijst geen authenticiteit.'
    : screen?.state==='inconclusive'&&screen.reason==='missing_or_unreadable_evidence'
    ? 'Fotoanalyse: onvoldoende leesbaar merk- of waslabel. Vraag duidelijke labelfoto’s op.'
    : screen?.state==='inconclusive'&&screen.reason==='photos_unavailable_or_too_large'
    ? 'Fotoanalyse: advertentiefoto’s konden niet worden beoordeeld. Vraag duidelijke foto’s van merk- en waslabels op.'
    : screen?.state==='disabled'
    ? 'Fotoanalyse is niet uitgevoerd. Controleer zelf kledingstuk, merklabel en waslabel.'
    : 'Nog niet visueel gecontroleerd — onderzoekskandidaat. Controleer zelf kledingstuk, merklabel en waslabel.';
  const standout=candidate.reason==='curator_pick'||candidate.reason==='high_deal_score';
  const selectionReason={preferred_japanese_story:'Jouw selectievoorkeur: het sterke Japanse verhaal maakt dit een opvallende Japansterdam-vondst.',preferred_porter_tanker:'Jouw selectievoorkeur: Porter Yoshida Tanker-tassen staan hoog op je lijst.',preferred_porter_tanker_green_orange:'Jouw favoriet: een Porter Yoshida Tanker in groen/olijf met oranje binnenkant.'}[candidate.curationReason];
  return [standout?'JAPANSTERDAM PICK — DEZE VERDIENT EEN KIJK':'ONDERZOEK — GEEN KOOPADVIES',plain(item.title),`${plain(item.brand,60)} · €${item.price.toFixed(2)} · Maat ${plain(item.size,30)||'onbekend'}`,
    ...(item.dealRating?.state==='scored'?[`AI-dealscore: ${item.dealRating.score}/100 · indicatief — ${plain(item.dealRating.reason,160)}`]:[]),
    ...(item.publishedAt?['Geplaatst: '+item.publishedAt]:[]),
    standout?'Deze voldoet aan de Telegram-selectiedrempel voor score en prijs. Check zelf de uitvoering, recente verkochte prijzen en onderhandelruimte voordat je beslist.':'Kandidaat binnen jouw selectie; model, uitvoering en vraagprijs verdienen nader onderzoek. Een passende prijsreferentie ontbreekt.',
    ...(selectionReason?[selectionReason]:[]),
    ...(candidate.curationReason==='preferred_needles_garment'?['Selectie: een van jouw voorkeurscategorieën van Needles; beoordeel de specifieke uitvoering.']:[]),
    standout?'Verkoopwaarde en marge zijn niet bevestigd. Authenticiteit: niet bevestigd.': 'Verkoopwaarde en marge: onbekend. Authenticiteit: niet bevestigd.',photo,
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
  // One JSON binding avoids D1's 100-parameter limit without adding subrequests.
  const result=await sql(env,`INSERT INTO radar_research (pilot_id,item_id,data,priority,state,first_seen,last_seen)
    SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),'queued',json_extract(value,'$[4]'),json_extract(value,'$[5]')
    FROM json_each(?) WHERE true
    ON CONFLICT(pilot_id,item_id) DO UPDATE SET data=excluded.data,priority=excluded.priority,last_seen=excluded.last_seen RETURNING item_id,state`,JSON.stringify(entries)).all();
  return new Map(result.results.map(row=>[row.item_id,{id:row.item_id,state:row.state}]));
}
export async function queueResearch(env,item,candidate,policy,now) {
  const rows=await queueResearchBatch(env,[{item,candidate}],policy,now);
  return [...rows.values()][0]||null;
}

export async function processResearch(env,item,candidate,policy,{now,clock,fetcher,screen,mayScreen=()=>true,maySend=()=>true,queued:existingQueue}) {
  const queued=existingQueue||await queueResearch(env,item,candidate,policy,now);
  if(!queued||['notified','rejected','notification_pending'].includes(queued.state))return {queued:!!queued,sent:false};
  // Telegram is reserved for actual standouts: the attainable high-score
  // bargain gate or an explicit curator pick. Generic unknown-reference leads
  // stay in the backend results for manual review without Telegram noise.
  if(!['high_deal_score','curator_pick'].includes(candidate?.reason))return {queued:true,sent:false};
  if(!maySend())return {queued:true,sent:false};
  const photo=mayScreen()?await screen():{state:'unreviewed',reason:'photo_check_not_run'};
  const state=photo?.state==='rejected'?'rejected':photo?.state==='visually_consistent'?'review_ready':
    photo?.state==='inconclusive'&&photo.reason==='missing_or_unreadable_evidence'?'needs_labels':'unreviewed';
  await sql(env,'UPDATE radar_research SET state=?,photo_state=? WHERE pilot_id=? AND item_id=?',state,photo?.state||null,policy.id,queued.id).run();
  // This is explicitly a research lead, never a purchase or authenticity
  // approval. Contradictory visual evidence is still rejected above; uncertain
  // or unavailable photos are called out in the Telegram message.
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
