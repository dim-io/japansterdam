// Bounded Apify transport. No Telegram, AI or shop data; explicit provider allowlist.
const API='https://api.apify.com/v2';
export const candidates=['epicscrapers~vinted-search-scraper','topapi~vinted-scraper'];
export async function candidateRun(actor,input,{token,fetcher=fetch,maxCostUsd=.03,maxItems=10,runLabel=null}={}){
 if(!candidates.includes(actor)||![.015,.03,.09].includes(maxCostUsd)||![10,20,30,40,60].includes(maxItems)||!token)throw Error('Invalid source trial');
 if(maxItems>30&&(actor!=='topapi~vinted-scraper'||maxCostUsd!==.03))throw Error('Invalid expanded source budget');
 const request=async(path,method='GET',body)=>{
  const r=await fetcher(API+path,{method,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw Error('source_http_'+r.status);return r.json();
 };
 let run=(await request('/acts/'+actor+'/runs?timeout=120&waitForFinish=20&maxItems='+maxItems+'&maxTotalChargeUsd='+maxCostUsd+'&restartOnError=false','POST',input)).data;
 const valid=id=>/^[a-zA-Z0-9]+$/.test(id||'');
 if(!valid(run?.id))throw Error('invalid_source_run');
 const terminal=new Set(['SUCCEEDED','FAILED','TIMED-OUT','ABORTED']);
 for(let i=0;i<4&&!terminal.has(run.status);i++)run=(await request('/actor-runs/'+run.id+'?waitForFinish=20')).data;
 if(!terminal.has(run.status)){await request('/actor-runs/'+run.id+'/abort','POST');throw Error('source_timeout');}
 if(run.status!=='SUCCEEDED'||!valid(run.defaultDatasetId))throw Error('source_run_'+run.status);
 // Label the completed run in Console without changing its access or source output.
 if(runLabel){
  const label=String(runLabel).replace(/[\r\n]/g,' ').slice(0,240);
  try{await request('/actor-runs/'+run.id,'PUT',{runId:run.id,statusMessage:label+' — '+(run.statusMessage||run.status),isStatusMessageTerminal:true});}catch{/* A label failure must never restart or discard a successful scrape. */}
 }
 const rows=await request('/datasets/'+run.defaultDatasetId+'/items?clean=true&format=json&limit='+maxItems);
 if(!Array.isArray(rows))throw Error('invalid_source_rows');
 return {runId:run.id,observedAt:run.finishedAt,usageTotalUsd:run.usageTotalUsd,rows};
}
export function candidateInput(actor,brand,{monitor=false}={}){
 const url=new URL('https://www.vinted.nl/catalog');url.search=new URLSearchParams({search_text:brand,price_to:'70',currency:'EUR',order:'newest_first'});
 if(actor===candidates[0])return {startUrls:[{url:url.href}],maxProducts:10,includeDetails:true,trackPriceChanges:true,saveOnly:'new',webhookUrls:[],discordWebhookUrls:[]};
 if(actor===candidates[1])return {searchQueries:[brand],brands:[brand],...(brand==='Needles'?{brandIds:['360271']}:{ }),includeKeywords:[brand],catalogIds:['5','1904'],country:'nl',order:'newest_first',priceTo:70,maxItems:10,maxItemsPerSearch:10,includeDetails:true,includeSellerDetails:false,includeSellerReviews:false,language:'en',monitorMode:monitor,monitorStoreName:'japansterdam-source-acceptance-seeded-20261116',alertOnPriceDrop:false,skipFirstRun:true,resetMonitor:false};
 throw Error('Unknown candidate');
}
