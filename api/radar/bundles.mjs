import {curation,matchingCompanion,coherentLabelCodes,itemId,modelNumbers,isNeedlesTrackPants} from './curation.mjs';
import {researchCandidate} from './research.mjs';
import {readWardrobe} from './wardrobe.mjs';
import {preflight} from '../../tools/deal-radar/budget.mjs';
import {screenPhotos} from './vision.mjs';
import {sendTelegram,listingUrl} from '../../tools/deal-radar/scoring.mjs';
const sql=(env,q,...args)=>env.RADAR_DB.prepare(q).bind(...args);
const sellerKey=item=>item.sellerRef?.id?'id:'+item.sellerRef.id:item.sellerRef?.username?'name:'+item.sellerRef.username.toLowerCase():null;
const inWindow=(now,p)=>p.enabled&&now>=Date.parse(p.startsAt)&&now<Date.parse(p.endsAt);
export const BUNDLE_SCHEMA=[
 "CREATE TABLE IF NOT EXISTS radar_bundle_checks (pilot_id TEXT NOT NULL,item_id TEXT NOT NULL,data TEXT NOT NULL,seller_key TEXT NOT NULL,priority INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'queued',result TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(pilot_id,item_id))",
 "CREATE TABLE IF NOT EXISTS radar_bundle_limits (pilot_id TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0)",
 "CREATE TABLE IF NOT EXISTS radar_bundle_sellers (pilot_id TEXT NOT NULL,seller_key TEXT NOT NULL,PRIMARY KEY(pilot_id,seller_key))"
];
export async function queueBestBundle(env,items,config,policy,now){
 if(!policy.bundleChecks?.enabled)return 0;
 const candidates=items.map(item=>({item,preference:curation(item,config),candidate:researchCandidate(item,config,now,{forBundle:true})}))
  .filter(row=>row.preference.bundleWorthChecking&&row.candidate)
  .sort((a,b)=>b.candidate.priority-a.candidate.priority);
 const selected=candidates.slice(0,5).filter(row=>itemId(row.item));
 if(!selected.length)return 0;
 const rows=await sql(env,`INSERT OR IGNORE INTO radar_bundle_checks (pilot_id,item_id,data,seller_key,priority,created_at) VALUES ${selected.map(()=>'(?,?,?,?,?,?)').join(',')} RETURNING item_id`,...selected.flatMap(({item,candidate})=>[policy.id,itemId(item),JSON.stringify(item),sellerKey(item),candidate.priority,now])).all();
 return rows.results.length;

}
const text=value=>String(value||'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').slice(0,140);
export function bundleText(main,partner,screens){
 const codes=screens.map(s=>s?.state==='visually_consistent'?modelNumbers(s.careText):[]);
 return ['BUNDELONDERZOEK — GEEN KOOPADVIES',text(main.title),listingUrl(main.url),'Mogelijk bijpassend stuk van dezelfde verkoper:',text(partner.title),listingUrl(partner.url),
 `Vraagprijzen samen: €${(main.price+partner.price).toFixed(2)}. Verzending, koperskosten en bundelkorting niet bevestigd.`,
 'Overeenkomst gevonden in merk, kledingtype, kleur en uitvoering; controleer zelf of het daadwerkelijk dezelfde set is.',
 `Modelnummers uit automatische labeltranscriptie: ${codes[0].join(', ')||'niet leesbaar'} / ${codes[1].join(', ')||'niet leesbaar'}. Controleer ze op de originele foto’s en aan een passende referentie.`,
 'Een samenhangend nummerpatroon is geen echtheidsbewijs. Authenticiteit en verkoopmarge zijn niet bevestigd.'].join('\n');
}
export async function checkNextBundle(env,config,policy,{now=Date.now(),clock=Date.now,fetcher=fetch,wardrobe=readWardrobe,screen=screenPhotos,budget=preflight}={}){
 if(!policy.bundleChecks?.enabled||!inWindow(now,policy))return {bundleCheck:'inactive'};
 const row=await sql(env,"SELECT item_id,data,seller_key FROM radar_bundle_checks WHERE pilot_id=? AND state='queued' ORDER BY priority DESC,created_at ASC LIMIT 1",policy.id).first();
 if(!row)return {bundleCheck:'empty'};
 let main=JSON.parse(row.data);
 if(!researchCandidate(main,config,clock(),{forBundle:true})){
  await sql(env,"UPDATE radar_bundle_checks SET state='stale' WHERE pilot_id=? AND item_id=? AND state='queued'",policy.id,row.item_id).run();return {bundleCheck:'stale'};
 }
 const prior=await sql(env,"SELECT item_id FROM radar_bundle_checks WHERE pilot_id=? AND seller_key=? AND state NOT IN ('queued','stale','budget_exhausted','seller_already_checked') AND item_id<>? LIMIT 1",policy.id,row.seller_key,row.item_id).first();
 if(prior){await sql(env,"UPDATE radar_bundle_checks SET state='seller_already_checked' WHERE pilot_id=? AND item_id=?",policy.id,row.item_id).run();return {bundleCheck:'seller_already_checked'};}
 // Keep all paid-source calls inside the explicitly authorized included-credit reserve.
 const source=await budget(env.APIFY_TOKEN,fetcher,.31,policy.sourceBudget);
 if(!(source.includedPlanConfirmed??source.freePlanConfirmed)||!source.enoughCredit)return {bundleCheck:'budget_blocked'};
 if(!inWindow(clock(),policy))return {bundleCheck:'inactive'};
 const claim=await sql(env,"UPDATE radar_bundle_checks SET state='pending' WHERE pilot_id=? AND item_id=? AND state='queued' RETURNING item_id",policy.id,row.item_id).first();
 if(!claim)return {bundleCheck:'already_reserved'};
 const sellerClaim=await sql(env,'INSERT OR IGNORE INTO radar_bundle_sellers (pilot_id,seller_key) VALUES (?,?) RETURNING seller_key',policy.id,row.seller_key).first();
 if(!sellerClaim){await sql(env,"UPDATE radar_bundle_checks SET state='seller_already_checked' WHERE pilot_id=? AND item_id=?",policy.id,row.item_id).run();return {bundleCheck:'seller_already_checked'};}
 await sql(env,'INSERT OR IGNORE INTO radar_bundle_limits (pilot_id) VALUES (?)',policy.id).run();
 const reserve=await sql(env,'UPDATE radar_bundle_limits SET attempts=attempts+1 WHERE pilot_id=? AND attempts<? RETURNING attempts',policy.id,Math.min(policy.bundleChecks.maxAttempts||0,4)).first();
 if(!reserve){await sql(env,"UPDATE radar_bundle_checks SET state='budget_exhausted' WHERE pilot_id=? AND item_id=?",policy.id,row.item_id).run();return {bundleCheck:'budget_exhausted'};}
 let outcome={bundleCheck:'no_matching_piece',checked:0,sent:0};
 try{
  const items=await wardrobe(env.APIFY_TOKEN,main.sellerRef,config,{fetcher,clock});
  outcome.checked=items.length;
  const refreshed=items.find(item=>itemId(item)===itemId(main));
  if(refreshed&&researchCandidate(refreshed,config,clock(),{forBundle:true}))main=refreshed;
  else outcome.bundleCheck='primary_availability_not_reconfirmed';
  const partner=outcome.bundleCheck==='primary_availability_not_reconfirmed'?null:items.find(item=>matchingCompanion(main,item,config)&&researchCandidate(item,config,clock(),{forBundle:true}));
  if(partner&&inWindow(clock(),policy)){
   const screens=[];
   // Preserve the daily three-call and per-trial four-call limits, including readiness.
   for(const item of [main,partner])screens.push(await screen(env,item,config,policy,{now:clock(),clock,fetcher}));
   if(screens.some(s=>s.state==='rejected'))outcome.bundleCheck='contradictory_labels';
   else if(policy.requireVisualBrandEvidence&&screens.some(s=>s.state!=='visually_consistent'))outcome.bundleCheck='needs_readable_brand_labels';
   else if([main,partner].some(item=>isNeedlesTrackPants(item,config))&&!coherentLabelCodes(...screens))outcome.bundleCheck='needs_both_readable_model_numbers';
   else if(inWindow(clock(),policy)){
    const delivery=await sql(env,"INSERT OR IGNORE INTO radar_alerts (pilot_id,item_id,price,delivery,attempted_at) VALUES (?,?,?,'pending',?) RETURNING item_id",policy.id,'bundle:'+row.item_id,main.price+partner.price,clock()).first();
    if(delivery){
     const messageId=await sendTelegram(bundleText(main,partner,screens),env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_CHAT_ID,fetcher);
     await sql(env,"UPDATE radar_alerts SET delivery='sent',message_id=? WHERE pilot_id=? AND item_id=?",messageId,policy.id,'bundle:'+row.item_id).run();
     outcome={...outcome,bundleCheck:'potential_set_sent',sent:1};
    }else outcome.bundleCheck='already_notified';
   }
  }
 }catch(error){outcome.bundleCheck='lookup_or_delivery_unconfirmed';outcome.reason=/^WARDROBE_[A-Z_0-9]+$/.test(error?.message||'')?error.message:'unconfirmed_source_or_delivery';}
 // Only minimal wardrobe evidence is retained, no seller profiles, ratings or reviews.
 await sql(env,'UPDATE radar_bundle_checks SET state=?,result=? WHERE pilot_id=? AND item_id=?',outcome.bundleCheck,JSON.stringify(outcome),policy.id,row.item_id).run();
 return outcome;
}
