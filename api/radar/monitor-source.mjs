import {candidateRun} from './source-candidates.mjs';
import {normalizeRow} from '../../tools/deal-radar/provider.mjs';
import {identifyBrand,itemPriceLimit} from '../../tools/deal-radar/scoring.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
export const MONITOR_STORE='japansterdam-new-garments-v1'; // Stable across trials and redeploys.
export function monitorStore(names){
 let hash=2166136261;for(const c of [...names].sort().join('|'))hash=Math.imul(hash^c.charCodeAt(0),16777619);
 return MONITOR_STORE+'-'+(hash>>>0).toString(16);
}
export function monitorInput(selection){
 if(!Array.isArray(selection)||selection.length<1||selection.length>3)throw Error('Invalid monitor group');
 const names=selection.map(([b])=>b);
 if(names.some(b=>identifyBrand(b,config)!==b))throw Error('Unrecognized monitor brand');
 return {searchQueries:selection.map(([brand,id])=>{
  const u=new URL('https://www.vinted.nl/catalog');u.search=new URLSearchParams({search_text:brand,price_to:String(itemPriceLimit(brand,config)),currency:'EUR',order:'newest_first'});
  if(typeof id==='string'&&/^\d+$/.test(id))u.searchParams.append('brand_ids[]',id);
  return u.href;
 }),brands:names,includeKeywords:names,country:'nl',order:'newest_first',maxItems:selection.length*10,maxItemsPerSearch:10,includeDetails:true,includeSellerDetails:false,includeSellerReviews:false,language:'en',catalogIds:['5','1904'],monitorMode:true,monitorStoreName:monitorStore(names),skipFirstRun:true,resetMonitor:false,alertOnPriceDrop:false};
}
export function monitorRow(row,observedAt){
 if(row.record_type&&row.record_type!=='item')return null;
 let availability=row.availability==='InStock'?'available':row.availability;
 if(row.is_sold===true||row.is_reserved===true||row.is_hidden===true||row.can_buy===false)availability='unavailable';
 else if(!availability&&row.can_buy===true&&row.is_sold===false&&row.is_reserved===false&&row.is_hidden===false)availability='available';
 const item=normalizeRow({...row,link:row.url,brand:row.brand_title,price:row.price_amount,currency:row.price_currency,size:row.size_title,image:row.photo_url,availability},observedAt,70);
 if(!item||!identifyBrand(item.brand,config)||item.price>itemPriceLimit(item.brand,config))return null;
 return item;
}
export async function monitorGroup(selection,{token,fetcher=fetch}={}){
 const input=monitorInput(selection);
 const r=await candidateRun('topapi~vinted-scraper',input,{token,fetcher,maxCostUsd:.09,maxItems:selection.length*10});
 const normalized=r.rows.map(row=>monitorRow(row,r.observedAt)).filter(Boolean);
 return selection.map(([brand])=>({brand,runId:r.runId,returned:r.rows.filter(row=>identifyBrand(row.brand_title,config)===brand).length,normalizedCount:normalized.filter(i=>identifyBrand(i.brand,config)===brand).length,items:normalized.filter(i=>identifyBrand(i.brand,config)===brand),freshness:{state:'source_monitor_new_only',baseline:'skip_first_run',store:input.monitorStoreName}}));
}
