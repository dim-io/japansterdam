import {publicationDetails} from './intake.mjs';
import {listingUrl} from '../../tools/deal-radar/scoring.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import {canonicalListingBrand,selectionRejection} from '../../tools/deal-radar/selection.mjs';
import {itemPriceLimit} from '../../tools/deal-radar/scoring.mjs';
import {monitorRow} from './monitor-source.mjs';
import {readCatalog} from './catalog.mjs';
import {queueDealRatings,readDealRatings} from './deal-ratings.mjs';

const ORIGINS=new Set(['https://japansterdam.com','https://www.japansterdam.com','https://dim-io.github.io','https://japansterdam-web.sam-jesse.workers.dev']);
const PAGE_SIZE=36;
export const sourceDatasetLimit=policy=>policy.maxResultsPerBrand===20?60:30;
const clean=(s,n=240)=>String(s||'').replace(/\s+/g,' ').slice(0,n);
export function reviewItem(row,run,radarConfig=config){
 const url=listingUrl(row.url||row.link);if(!url||row.record_type&&row.record_type!=='item')return null;
 const category=Array.isArray(row.category_path)?row.category_path.join(' / '):row.category_path;
 const candidate={brand:row.brand_title||row.brand,title:row.title,description:row.description,category};
 const brand=canonicalListingBrand(candidate,radarConfig)||clean(row.brand_title||row.brand,80);
 const originalTitle=clean(row.title);const price=Number(row.price_amount??row.price);
 if(!brand||!originalTitle||!Number.isFinite(price)||price<=0)return null;
 candidate.brand=brand;
 if(selectionRejection(candidate,radarConfig)||price>itemPriceLimit(brand,radarConfig))return null;
 const photo=row.photo_url||row.image;let image=null;
 try{const u=new URL(photo);if(u.protocol==='https:'&&/^images\d*\.vinted\.net$/.test(u.hostname)&&!u.username&&!u.password&&!u.port)image=u.href;}catch{}
 const publication=publicationDetails(row,run.finishedAt||run.startedAt);
 return {id:/\/items\/(\d+)/.exec(url)[1],url,brand,title:brand+' — '+originalTitle,originalTitle,price,currency:clean(row.price_currency||row.currency,8),size:clean(row.size_title||row.size,50),condition:clean(row.condition||row.status,50),image,
  uploadedAt:publication?.at||null,uploadTimeKind:publication?.kind||'unknown',uploadPrecision:publication?.precision||null,sourceAge:clean(row.uploaded_ago,60),observedAt:run.finishedAt||run.startedAt,
  runId:run.id,runUrl:'https://console.apify.com/actors/gu7NqrMYT471tlfsB/runs/'+run.id,
  category:clean(category,240)};
}

// Read existing results only. Never start an Actor, send an alert or expose a key.
export async function reviewResults(request,env,policy,{fetcher=fetch,config:radarConfig=config}={}){
 const origin=request.headers.get('Origin');
 const headers={'Cache-Control':'private, no-store','Vary':'Origin','Content-Type':'application/json'};
 if(origin&&!ORIGINS.has(origin))return new Response('{"error":"Origin not allowed"}',{status:403,headers});
 if(origin)headers['Access-Control-Allow-Origin']=origin;
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Authorization','Access-Control-Max-Age':'600'}});
 if(request.method!=='GET')return reply({error:'Method not allowed'},405);
 const authorization=request.headers.get('Authorization')||'';
 if(!/^Bearer [0-9a-f]{64}$/i.test(authorization)||!env.SHOP_API?.fetch)return reply({error:'Log eerst in bij Japansterdam.'},401);
 try{
  const auth=await env.SHOP_API.fetch(new Request('https://shop.internal/auth/me',{headers:{Authorization:authorization}}));
  if(!auth.ok)return reply({error:'Je sessie is verlopen. Log opnieuw in.'},401);
  const raw=new URL(request.url).searchParams.get('offset')||'0';
  if(!/^\d{1,4}$/.test(raw)||Number(raw)>1980)return reply({error:'Ongeldige pagina.'},400);
  const offset=Number(raw);
  const get=async path=>{const response=await fetcher('https://api.apify.com/v2'+path,{headers:{Authorization:'Bearer '+env.APIFY_TOKEN},redirect:'manual',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('source_unavailable');return response.json();};
  const list=await get('/acts/topapi~vinted-scraper/runs?desc=true&limit='+PAGE_SIZE+'&offset='+offset);
  const runs=list.data?.items;if(!Array.isArray(runs))throw Error('invalid_source');
  const trialStart=Date.parse(policy.continuous?.historyStartsAt||policy.startsAt),trialEnd=Date.parse(policy.endsAt);
  const trialRuns=runs.filter(run=>{const started=Date.parse(run.startedAt);return Number.isFinite(started)&&started>=trialStart&&started<trialEnd;});
  const rows=[],rounds=[],ratingItems=[];let failedDatasets=0;
  // At most 41 reads including auth, catalog and rating cache; no model calls.
  // Four concurrent reads avoid opening too many upstream connections.
  for(let start=0;start<trialRuns.length;start+=4)await Promise.all(trialRuns.slice(start,start+4).map(async run=>{
   if(run.status!=='SUCCEEDED'||!/^[a-zA-Z0-9]+$/.test(run.defaultDatasetId||'')||!/^[a-zA-Z0-9]+$/.test(run.id||''))return;
   if(/Nothing was charged\.|First monitor run:/.test(run.statusMessage||'')){rounds.push({id:run.id,empty:true,startedAt:run.startedAt,label:clean(run.statusMessage,400)});return;}
   try{const data=await get('/datasets/'+run.defaultDatasetId+'/items?clean=true&limit='+sourceDatasetLimit(policy));if(!Array.isArray(data))throw Error('invalid_dataset');
    rows.push(...data.map(row=>reviewItem(row,run,radarConfig)).filter(Boolean));
    if(policy.dealScoring?.enabled&&env.RADAR_DB)ratingItems.push(...data.map(row=>monitorRow(row,run.finishedAt||run.startedAt)).filter(Boolean));
    rounds.push({id:run.id,count:data.length,startedAt:run.startedAt,label:clean(run.statusMessage,400)});
   }catch{failedDatasets++;}
  }));
  // Keep only the newest source snapshot for each Vinted listing ID. This
  // prevents the same piece from being repeated across monitor rounds.
  const latestById=new Map();
  for(const row of rows){const old=latestById.get(row.id);if(!old||Date.parse(row.observedAt)>=Date.parse(old.observedAt))latestById.set(row.id,row);}
  rows.splice(0,rows.length,...[...latestById.values()].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)));
  if(policy.dealScoring?.enabled&&env.RADAR_DB){
   try{
    try{const products=await readCatalog(env,fetcher);await queueDealRatings(env,ratingItems,radarConfig,products,policy);}catch{/* Keep existing ratings usable when the public catalog is down. */}
    const ratings=await readDealRatings(env,rows,policy);
    for(const row of rows)row.dealRating=ratings.get(row.id)||{state:policy.brands[row.brand]&&row.currency==='EUR'&&row.price<=itemPriceLimit(row.brand,radarConfig)?'queued':'not_eligible'};
   }catch{for(const row of rows)row.dealRating={state:'unavailable'};}
  }
  return reply({rows,rounds,runIds:trialRuns.map(run=>run.id),sourceMode:policy.sourceMode||'new-only',selectedBrands:Object.keys(policy.brands),nextOffset:trialRuns.length===PAGE_SIZE?offset+PAGE_SIZE:null,
   loadedRuns:trialRuns.length,failedDatasets,trial:policy.id,endsAt:policy.continuous?null:policy.endsAt,runMode:policy.continuous?'continuous':'trial',active:policy.enabled&&Date.now()>=Date.parse(policy.startsAt)&&Date.now()<Date.parse(policy.endsAt),
   cycleMinutes:(policy.brandGroups?.length||12)*5});
 }catch{return reply({error:'Bronresultaten tijdelijk niet beschikbaar. Er is geen nieuwe zoekopdracht gestart.'},503);}
}
