import {researchAssessment} from './research.mjs';

// Aggregate counters only. No titles, links, seller identifiers or model payloads.
export const DIAGNOSTIC_SCHEMA='CREATE TABLE IF NOT EXISTS radar_scan_reports (pilot_id TEXT NOT NULL, slot INTEGER NOT NULL, report TEXT NOT NULL, PRIMARY KEY(pilot_id,slot))';
export function brandDiagnostics(results,decisions,config,now) {
 const photos=new Map(decisions.map(d=>[d.itemId,d]));
 return results.map(r=>{
  const reasons={},photoStates={},photoReasons={};
  for(const item of r.items){
   const idForReason=/\/items\/(\d+)/.exec(item.url)?.[1];
   const decisionReason=photos.get(idForReason)?.reason;
   const reason=['already_seen','not_clothing','upload_time_unknown','listing_not_recent','brand_claim_unsupported','imitation_language','garment_type_unknown','research_priority_below_threshold'].includes(decisionReason)?decisionReason:researchAssessment(item,config,now).reason;reasons[reason]=(reasons[reason]||0)+1;
   const id=/\/items\/(\d+)/.exec(item.url)?.[1];const decision=photos.get(id);const state=decision?.photoScreening||'not_checked';photoStates[state]=(photoStates[state]||0)+1;
   const photoReason=decision?.photoReason||'photo_check_not_run';photoReasons[photoReason]=(photoReasons[photoReason]||0)+1;
  }
  return {brand:r.brand,scans:1,sourceReturned:r.returned??r.items.length,checked:r.items.length,
   excludedByBrand:Math.max(0,(r.normalizedCount??r.items.length)-r.items.length),
   excludedAtNormalization:Math.max(0,(r.returned??r.items.length)-(r.normalizedCount??r.items.length)),reasons,photoStates,photoReasons};
 });
}
export function summarizeDiagnostics(rows) {
 const brands=new Map();
 for(const row of rows)for(const b of JSON.parse(row.report)){
  const total=brands.get(b.brand)||{brand:b.brand,scans:0,sourceReturned:0,checked:0,excludedByBrand:0,excludedAtNormalization:0,reasons:{},photoStates:{},photoReasons:{}};
  for(const key of ['scans','sourceReturned','checked','excludedByBrand','excludedAtNormalization'])total[key]+=b[key]||0;
  for(const key of ['reasons','photoStates','photoReasons'])for(const [reason,count]of Object.entries(b[key]||{}))total[key][reason]=(total[key][reason]||0)+count;
  brands.set(b.brand,total);
 }
 return [...brands.values()];
}
