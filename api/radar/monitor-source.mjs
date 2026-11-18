import {candidateRun} from './source-candidates.mjs';
import {normalizeRow} from '../../tools/deal-radar/provider.mjs';
import {identifyBrand,itemPriceLimit} from '../../tools/deal-radar/scoring.mjs';
import {canonicalListingBrand} from '../../tools/deal-radar/selection.mjs';
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
 const terms=([brand,id])=>typeof id==='object'?(id.searchTerms||[id.searchText||brand]):[brand];
 const searchQueries=selection.flatMap(entry=>terms(entry).map(term=>{
  if(typeof term!=='string'||term.length<2||term.length>80||/[\r\n]/.test(term))throw Error('Invalid monitor query');
  const [brand,id]=entry;
  const u=new URL('https://www.vinted.nl/catalog');u.search=new URLSearchParams({search_text:term,price_to:String(itemPriceLimit(brand,config)),currency:'EUR',order:'newest_first'});
  if(typeof id==='string'&&/^\d+$/.test(id))u.searchParams.append('brand_ids[]',id);
  return u.href;
 })).concat(names.includes('Needles')?['Rebuild by Needles']:[]);
 if(searchQueries.length>9)throw Error('Too many monitor queries');
 // New line-specific searches must not generate an additional whole-brand query.
 // Split the same result allowance over more queries, rather than growing the run.
 const maxItems=selection.length*10;
 return {searchQueries,brands:selection.filter(([,id])=>!id?.exactQueriesOnly).map(([brand])=>brand),includeKeywords:[...new Set(selection.flatMap(([brand,id])=>id?.includeKeywords||[brand]).concat(names.includes('Needles')?['Rebuild by Needles']:[]))],priceTo:Math.max(...names.map(b=>itemPriceLimit(b,config))),country:'nl',order:'newest_first',maxItems,maxItemsPerSearch:searchQueries.length>4?Math.max(1,Math.floor(maxItems/searchQueries.length)):10,includeDetails:true,includeSellerDetails:false,includeSellerReviews:false,language:'en',catalogIds:['5','1904'],monitorMode:true,monitorStoreName:monitorStore(names),skipFirstRun:true,resetMonitor:false,alertOnPriceDrop:false};
}
export function monitorRow(row,observedAt){
 if(row.record_type&&row.record_type!=='item')return null;
 let availability=row.availability==='InStock'?'available':row.availability;
 if(row.is_sold===true||row.is_reserved===true||row.is_hidden===true||row.can_buy===false)availability='unavailable';
 else if(!availability&&row.can_buy===true&&row.is_sold===false&&row.is_reserved===false&&row.is_hidden===false)availability='available';
 const item=normalizeRow({...row,link:row.url,brand:row.brand_title,price:row.price_amount,currency:row.price_currency,size:row.size_title,image:row.photo_url,availability},observedAt,70);
 if(!item)return null;
 const brand=canonicalListingBrand(item,config);
 if(!brand||item.price>itemPriceLimit(brand,config))return null;
 item.brand=brand;
 return item;
}
const namesLabel=selection=>selection.map(([brand])=>brand==='Needles'?'Needles / Rebuild by Needles':brand==='ASICS'?'ASICS (Kiko / NOVALIS / Cecilie / JJJJound / HAL)':brand).join(' + ');
export async function monitorGroup(selection,{token,fetcher=fetch,maxCostUsd=.015}={}){
 const input=monitorInput(selection);
 const r=await candidateRun('topapi~vinted-scraper',input,{token,fetcher,maxCostUsd,maxItems:selection.length*10,runLabel:'Japansterdam — '+namesLabel(selection)});
 const normalized=r.rows.map(row=>monitorRow(row,r.observedAt)).filter(Boolean);
 return selection.map(([brand])=>({brand,runId:r.runId,returned:r.rows.filter(row=>identifyBrand(row.brand_title,config)===brand).length,normalizedCount:normalized.filter(i=>identifyBrand(i.brand,config)===brand).length,items:normalized.filter(i=>identifyBrand(i.brand,config)===brand),freshness:{state:'source_monitor_new_only',baseline:'skip_first_run',store:input.monitorStoreName}}));
}
