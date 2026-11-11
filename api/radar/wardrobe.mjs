import {normalizeRow,sellerReference} from '../../tools/deal-radar/provider.mjs';
import {itemPriceLimit} from '../../tools/deal-radar/scoring.mjs';

// Documented source: omkar-cloud/vinted-seller-scraper. No reviews or account enrichment.
export async function readWardrobe(token,ref,config,{fetcher=fetch,clock=Date.now}={}) {
 const seller=sellerReference({seller_id:ref?.id,seller_username:ref?.username});
 if(!token||!seller)throw Error('WARDROBE_SOURCE_INVALID');
 const api=async(path,options={})=>{
  const r=await fetcher('https://api.apify.com/v2'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error('WARDROBE_SOURCE_UNAVAILABLE');return r.json();
 };
 let run=(await api('/actors/omkar-cloud~vinted-seller-scraper/runs?timeout=90&waitForFinish=20&maxItems=11&maxTotalChargeUsd=0.03&restartOnError=false',{method:'POST',body:JSON.stringify({sellers:[seller.id||seller.username],includeItems:true,includeFeedback:false,maxItems:10,maxFeedback:0,language:'en'})})).data;
 const valid=r=>r&&/^[A-Za-z0-9]+$/.test(r.id||'');
 if(!valid(run))throw Error('WARDROBE_SOURCE_INVALID');
 const terminal=new Set(['SUCCEEDED','FAILED','TIMED-OUT','ABORTED']);
 for(let i=0;i<3&&!terminal.has(run.status);i++) {
  run=(await api('/actor-runs/'+run.id+'?waitForFinish=20')).data;
  if(!valid(run))throw Error('WARDROBE_SOURCE_INVALID');
 }
 if(!terminal.has(run.status)){
  await api('/actor-runs/'+run.id+'/abort',{method:'POST'});throw Error('WARDROBE_SOURCE_UNAVAILABLE');
 }
 if(run.status!=='SUCCEEDED'||!/^[A-Za-z0-9]+$/.test(run.defaultDatasetId||''))throw Error('WARDROBE_SOURCE_UNAVAILABLE');
 const finished=Date.parse(run.finishedAt);
 if(!Number.isFinite(finished)||finished>clock()+300000||clock()-finished>90*60000)throw Error('WARDROBE_SOURCE_STALE');
 const rows=await api('/datasets/'+run.defaultDatasetId+'/items?clean=true&format=json&limit=11');
 if(!Array.isArray(rows))throw Error('WARDROBE_SOURCE_INVALID');
 const same=row=>seller.id?String(row.seller_id||'')===seller.id:String(row.seller_username||'').toLowerCase()===seller.username.toLowerCase();
 return rows.filter(row=>row.row_type==='item'&&same(row)).slice(0,10).map(row=>{
  // The documented wardrobe endpoint returns active listings. Explicit sold/hidden flags override it.
  const availability=row.is_sold===true||row.is_closed===true||row.is_hidden===true?'unavailable':row.availability||'available';
  return normalizeRow({...row,availability},run.finishedAt,itemPriceLimit(row.brand,config));
 }).filter(Boolean);
}
