import {createHash} from 'node:crypto';
// Audit existing results without publishing item data. No new scraper/GPU runs.
// Only aggregate counts, fixed rejection messages and public-catalogue match counts are logged.
import {normalizeRow} from '../../tools/deal-radar/provider.mjs';
import {assess} from '../../tools/deal-radar/scoring.mjs';
import {estimateFromShop,garmentType,missingReferenceReason} from '../../tools/deal-radar/valuation.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import policy from '../../tools/deal-radar/pilot-v2.json' with {type:'json'};
async function get(path){
 const r=await fetch('https://api.apify.com/v2'+path,{headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN},redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Bron niet beschikbaar');return r.json();
}
async function publicIds(url){
 const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!r.ok)return[];
 const reader=r.body.getReader();let html='',size=0;const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024)return[];html+=decoder.decode(value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
 if(/cf-chl-|challenge-platform/i.test(html))return[];
 return[...new Set([...html.matchAll(/href=["'](?:https:\/\/www\.vinted\.nl)?\/items\/(\d+)[^"']*["']/g)].map(m=>m[1]))].slice(0,10);
}
async function main(){
 const r=await fetch(config.inventoryUrl,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Referenties ontbreken');const products=await r.json();
 const runs=(await get('/acts/omkar-cloud~vinted-scraper/runs?desc=true&limit=50')).data.items;
 const seen=new Set(),sampleIds=[];
 const result={readOnly:true,runsChecked:0,itemsChecked:0,normalReasons:{},preliminaryReasons:{},modelReferences:0,unknownGarmentTypes:0,photoCandidates:0,enoughPhotos:0,liveCatalogCompared:0,liveCatalogMatches:0,liveOrderMatches:0,observedWithin90Minutes:true,descriptionRows:0,photoArrayRows:0,imageArrayRows:0,photoUrlsArrayRows:0,imageUrlsArrayRows:0,maxRawPhotoArrayLength:0,documentedPhotoLinkRows:0};
 for(const run of runs){
  if(seen.size>=2)break;
  if(run.status!=='SUCCEEDED'||Date.parse(run.startedAt)<Date.parse(policy.startsAt)||Date.parse(run.startedAt)>=Date.parse(policy.endsAt))continue;
  const input=await get('/key-value-stores/'+encodeURIComponent(run.defaultKeyValueStoreId)+'/records/INPUT');
  if(!Object.values(policy.brands).includes(input.brandIds)||input.maxResults!==10||seen.has(input.brandIds))continue;
  seen.add(input.brandIds);result.runsChecked++;
  result.observedWithin90Minutes &&= Date.now()-Date.parse(run.finishedAt)<90*60000;
  const rows=await get('/datasets/'+encodeURIComponent(run.defaultDatasetId)+'/items?clean=true&format=json&limit=10');
  for(const row of rows){
   result.descriptionRows+=Number(!!row.description);
   result.documentedPhotoLinkRows+=Number(Array.isArray(row.photo_links));
   result.photoArrayRows+=Number(Array.isArray(row.photos));result.imageArrayRows+=Number(Array.isArray(row.images));
   result.photoUrlsArrayRows+=Number(Array.isArray(row.photo_urls)||Array.isArray(row.photoUrls));
   result.imageUrlsArrayRows+=Number(Array.isArray(row.image_urls)||Array.isArray(row.imageUrls));
   result.maxRawPhotoArrayLength=Math.max(result.maxRawPhotoArrayLength,...['photo_links','photos','images','photo_urls','photoUrls','image_urls','imageUrls'].map(k=>Array.isArray(row[k])?row[k].length:0));
  }
  const items=rows.map(row=>normalizeRow(row,run.finishedAt)).filter(Boolean);
  const live=await publicIds(input.searchQueries[0]);
  const ids=items.map(item=>/\/items\/(\d+)/.exec(item.url)?.[1]);
  sampleIds.push(...ids);
  result.liveCatalogCompared+=live.length;
  result.liveCatalogMatches+=live.filter(id=>ids.includes(id)).length;
  result.liveOrderMatches+=live.filter((id,i)=>id===ids[i]).length;
  for(const item of items){
   result.itemsChecked++;
   const valuation=estimateFromShop(item,products,config),data={...item,...(valuation?{valuation}:{})};
   const normal=assess(data,config,Date.parse(run.finishedAt));
   const preliminary=assess(data,{...config,authenticityRequiredBrands:[]},Date.parse(run.finishedAt));
   const reason=preliminary.reason==='Geen passende prijsreferentie: flipwaarde blijft onbekend'?missingReferenceReason(item,products,config):preliminary.reason;
   result.normalReasons[normal.reason]=(result.normalReasons[normal.reason]||0)+1;
   result.preliminaryReasons[reason]=(result.preliminaryReasons[reason]||0)+1;
   result.modelReferences+=Number(!!valuation);result.unknownGarmentTypes+=Number(!garmentType(item.title));
   result.photoCandidates+=Number(preliminary.eligible);result.enoughPhotos+=Number(item.photoUrls.length>=2);
  }
 }
 if(result.itemsChecked!==20)throw Error('Steekproef niet compleet');
 result.matchesPublicSnapshot=createHash('sha256').update(sampleIds.sort().join(',')).digest('hex')==='9a0cfb9ee98c0ca722deb3adbd620885b9c1a5d8f46b8ea1b6c7a936ebb45199';
 console.log(JSON.stringify(result));
}
main().catch(()=>{console.error('Controle niet voltooid; geen scans gestart.');process.exitCode=1;});
