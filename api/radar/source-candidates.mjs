// Acceptance-only providers. No Telegram, AI, shop data or recurring schedule.
const API='https://api.apify.com/v2';
export const candidates=['epicscrapers~vinted-search-scraper','topapi~vinted-scraper'];
export async function candidateRun(actor,input,{token,fetcher=fetch,maxCostUsd=.03}={}){
 if(!candidates.includes(actor)||maxCostUsd!==.03||!token)throw Error('Invalid source trial');
 const request=async(path,method='GET',body)=>{
  const r=await fetcher(API+path,{method,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw Error('source_http_'+r.status);return r.json();
 };
 let run=(await request('/acts/'+actor+'/runs?timeout=120&waitForFinish=20&maxItems=10&maxTotalChargeUsd=.03&restartOnError=false','POST',input)).data;
 const valid=id=>/^[a-zA-Z0-9]+$/.test(id||'');
 if(!valid(run?.id))throw Error('invalid_source_run');
 const terminal=new Set(['SUCCEEDED','FAILED','TIMED-OUT','ABORTED']);
 for(let i=0;i<4&&!terminal.has(run.status);i++)run=(await request('/actor-runs/'+run.id+'?waitForFinish=20')).data;
 if(!terminal.has(run.status)){await request('/actor-runs/'+run.id+'/abort','POST');throw Error('source_timeout');}
 if(run.status!=='SUCCEEDED'||!valid(run.defaultDatasetId))throw Error('source_run_'+run.status);
 const rows=await request('/datasets/'+run.defaultDatasetId+'/items?clean=true&format=json&limit=10');
 if(!Array.isArray(rows))throw Error('invalid_source_rows');
 return {runId:run.id,observedAt:run.finishedAt,usageTotalUsd:run.usageTotalUsd,rows};
}
export function candidateInput(actor,brand,{monitor=false}={}){
 const url=new URL('https://www.vinted.nl/catalog');url.search=new URLSearchParams({search_text:brand,price_to:'70',currency:'EUR',order:'newest_first'});
 if(actor===candidates[0])return {startUrls:[url.href],maxProducts:10,includeDetails:true,trackPriceChanges:true,saveOnly:'new',webhookUrls:[],discordWebhookUrls:[]};
 if(actor===candidates[1])return {searchQueries:[brand],country:'nl',order:'newest_first',priceTo:70,maxItems:10,maxItemsPerSearch:10,includeDetails:true,includeSellerDetails:false,includeSellerReviews:false,language:'en',monitorMode:monitor,monitorStoreName:'japansterdam-source-acceptance-20261116',alertOnPriceDrop:false,skipFirstRun:false,resetMonitor:false};
 throw Error('Unknown candidate');
}
