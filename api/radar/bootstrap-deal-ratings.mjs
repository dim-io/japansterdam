// Backfill from already-paid datasets. No new scrape, alert or trial reservation.
import {pathToFileURL} from 'node:url';
import {client,TARGET} from './account-migration.mjs';
import {databaseAdapter,aiAdapter} from './owner-readiness.mjs';
import {freePlanDecision} from './free-plan.mjs';
import {monitorRow} from './monitor-source.mjs';
import {readCatalog} from './catalog.mjs';
import {queueDealRatings,scoreDealBatch} from './deal-ratings.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import policy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};

export async function bootstrapRatings(env,{query,fetcher=fetch,now=Date.now(),testPolicy=policy}={}){
 if(!testPolicy.dealScoring?.enabled||!testPolicy.enabled||now<Date.parse(testPolicy.startsAt)||now>=Date.parse(testPolicy.endsAt))return {state:'inactive'};
 if(!freePlanDecision({},testPolicy,now).allowed)return {state:'free_plan_not_confirmed'};
 const runtime={RADAR_DB:databaseAdapter(query),AI:aiAdapter(env.CLOUDFLARE_API_TOKEN,fetcher),VISION_FREE_CONFIRMED:'true',SHOP_CATALOG_URL:'https://japansterdam-api.sam-jesse.workers.dev/public/products'};
 const get=async path=>{
  const r=await fetcher('https://api.apify.com/v2'+path,{headers:{Authorization:'Bearer '+env.APIFY_TOKEN},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('source_read_failed');return r.json();
 };
 const list=await get('/acts/topapi~vinted-scraper/runs?desc=true&limit=12');
 const runs=(list.data?.items||[]).filter(run=>run.status==='SUCCEEDED'&&/^[a-zA-Z0-9]+$/.test(run.defaultDatasetId||'')&&!/Nothing was charged\.|First monitor run:/.test(run.statusMessage||''));
 const items=[];
 for(const run of runs){const data=await get('/datasets/'+run.defaultDatasetId+'/items?clean=true&limit=30');if(Array.isArray(data))items.push(...data.map(row=>monitorRow(row,run.finishedAt||run.startedAt)).filter(Boolean));}
 const products=await readCatalog(runtime,fetcher);
 const queued=await queueDealRatings(runtime,items,config,products,testPolicy,{now});
 const batches=[];
 for(let i=0;i<2;i++){const result=await scoreDealBatch(runtime,testPolicy);batches.push(result);if(result.state!=='completed'||!result.scored)break;}
 return {state:'completed',queued,scored:batches.reduce((n,b)=>n+(b.scored||0),0),failed:batches.reduce((n,b)=>n+(b.failed||0),0),batches:batches.length,failureReasons:[...new Set(batches.map(b=>b.failureReason).filter(Boolean))],newScraperStarts:0,messagesSent:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)bootstrapRatings(process.env,{query:client(TARGET,process.env.CLOUDFLARE_API_TOKEN)}).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Bestaande resultaten tijdelijk niet beoordeeld; de Radar hervat dit binnen het dagbudget.');process.exitCode=1;});
