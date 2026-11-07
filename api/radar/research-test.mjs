import {readCatalog} from './catalog.mjs';
import {normalize,itemPriceLimit} from '../../tools/deal-radar/scoring.mjs';
import {normalizeRow} from '../../tools/deal-radar/provider.mjs';
import {estimateFromShop} from '../../tools/deal-radar/valuation.mjs';
import {researchCandidate,queueResearch,processResearch} from './research.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import {screenPhotos} from './vision.mjs';
const sql=(env,query,...args)=>env.RADAR_DB.prepare(query).bind(...args);
const validId=value=>/^[A-Za-z0-9]+$/.test(value||'');

// Only GETs to existing runs and datasets. Never starts/retries a scraper run.
export async function existingResults(token,policy,{fetcher=fetch,now=Date.now()}={}) {
  async function get(path) {
    const r=await fetcher('https://api.apify.com/v2'+path,{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('stored_source_http_'+r.status);return r.json();
  }
  const listing=await get('/acts/omkar-cloud~vinted-scraper/runs?desc=true&limit=8');
  const found=new Map();
  for(const run of (listing.data?.items||[]).slice(0,6)) {
    if(found.size===Object.keys(policy.brands).length)break;
    const finished=Date.parse(run.finishedAt),started=Date.parse(run.startedAt);
    if(run.status!=='SUCCEEDED'||!Number.isFinite(started)||!Number.isFinite(finished)||started>finished||now-finished>90*60000||finished>now+300000
      ||Date.parse(run.startedAt)<Date.parse(policy.startsAt)||finished>=Date.parse(policy.endsAt)
      ||!validId(run.defaultKeyValueStoreId)||!validId(run.defaultDatasetId))continue;
    const input=await get('/key-value-stores/'+run.defaultKeyValueStoreId+'/records/INPUT');
    if(!Object.values(policy.brands).includes(input.brandIds)||input.maxResults!==10||found.has(input.brandIds))continue;
    const rows=await get('/datasets/'+run.defaultDatasetId+'/items?clean=true&format=json&limit=10');
    if(!Array.isArray(rows))throw Error('stored_source_invalid');
    const expected=Object.entries(policy.brands).find(([,id])=>id===input.brandIds)?.[0];
    found.set(input.brandIds,rows.slice(0,10).map(row=>normalizeRow(row,run.finishedAt,itemPriceLimit(expected,config))).filter(item=>item&&normalize(item.brand)===normalize(expected)));
  }
  if(found.size!==Object.keys(policy.brands).length)throw Error('recent_stored_results_missing');
  return [...found.values()].flat();
}

export async function runResearchTest(env,config,policy,{now=Date.now(),clock=Date.now,fetcher=fetch,readExisting=existingResults}={}) {
  if(!policy.researchTestOnce||!policy.researchEnabled||!policy.enabled||now<Date.parse(policy.startsAt)||now>=Date.parse(policy.endsAt))return null;
  const claim=await sql(env,"INSERT OR IGNORE INTO radar_research_tests (pilot_id,attempted_at,state) VALUES (?,?,'pending') RETURNING pilot_id",policy.id,now).first();
  if(!claim)return null;
  let report;
  try {
    const items=await readExisting(env.APIFY_TOKEN,policy,{fetcher,now});
    const products=await readCatalog(env,fetcher);
    const candidates=items.map(item=>({item,candidate:estimateFromShop(item,products,config)?null:researchCandidate(item,config,now)}))
      .filter(row=>row.candidate).sort((a,b)=>b.candidate.priority-a.candidate.priority).slice(0,5);
    for(const row of candidates)await queueResearch(env,row.item,row.candidate,policy,now);
    const ready=await sql(env,'SELECT smoke_ok FROM radar_vision_control WHERE id=?',policy.id).first();
    let result=null;
    if(candidates.length&&ready?.smoke_ok===1&&clock()<Date.parse(policy.endsAt)) {
      const {item,candidate}=candidates[0];
      result=await processResearch(env,item,candidate,policy,{now,clock,fetcher,screen:()=>screenPhotos(env,item,config,policy,{now,clock,fetcher})});
    }
    report={state:'completed',checked:items.length,queued:candidates.length,photoState:result?.photo?.state||null,sent:Number(result?.sent||0),newScraperStarts:0};
  } catch {
    // Never expose provider exceptions, listing data or credentials.
    report={state:'failed',reason:'stored_research_test_incomplete',newScraperStarts:0};
  }
  await sql(env,'UPDATE radar_research_tests SET state=?,report=? WHERE pilot_id=?',report.state,JSON.stringify(report),policy.id).run();
  return report;
}
