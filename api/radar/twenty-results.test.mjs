import test from 'node:test';
import assert from 'node:assert/strict';
import {privateRuntime} from './private-runtime.mjs';
import {scanSelection,inWindow} from './worker.mjs';
import {monitorInput,monitorGroup,monitorStore} from './monitor-source.mjs';
import {candidateRun} from './source-candidates.mjs';
import {scanLimit,sourceReserve} from './trial-limits.mjs';
import {reviewResults} from './review-results.mjs';

const now=Date.parse('2026-11-27T22:00:00Z');
const runtime=privateRuntime({RADAR_PRIVATE_CONFIG:JSON.stringify({
 deployment:{accountId:'fixture'},policy:{enabled:true,id:'prior',startsAt:'2026-11-20T00:00:00Z',endsAt:'2026-11-21T00:00:00Z',maxAttempts:288,maxResultsPerBrand:10,maxCostPerMonitorRunUsd:.015,sourceBudget:{maxMonthlyUsageUsd:19},visionAccountConfirmation:{accountId:'fixture'}}
})},now);
const policy=runtime.policy;
const selection=[['Nonnative','355385'],['Wacko Maria','614622'],['Auralee','2053426']];
const row=(brand,n)=>({record_type:'item',url:`https://www.vinted.nl/items/${10000+n}-piece`,brand_title:brand,title:brand+' jacket',price_amount:30,price_currency:'EUR',condition:'Very good',availability:'InStock',uploaded_ago:'a minute ago'});

test('20-result runtime supersedes stale private limits without changing cycle, monthly ceiling or monitor identities',()=>{
 assert(inWindow(now,policy));assert.equal(scanLimit(policy),288);assert.equal(policy.maxResultsPerBrand,20);assert.equal(policy.maxCostPerMonitorRunUsd,.03);
 assert.equal(policy.sourceBudget.maxMonthlyUsageUsd,19);assert.equal(sourceReserve(policy),.31);
 assert.equal(policy.brandGroups.length*5,90);assert.equal(Object.keys(policy.brands).length,53);
 for(let slot=0;slot<18;slot++){
  const group=scanSelection(policy,slot),before=monitorInput(group),after=monitorInput(group,{perBrandLimit:20});
  assert.equal(after.maxItems,group.length*20);assert(after.maxItems<=60);assert.equal(after.maxItemsPerSearch,20);assert.equal(after.monitorStoreName,before.monitorStoreName);
  assert.deepEqual(after.searchQueries,before.searchQueries);assert.equal(after.resetMonitor,false);assert.equal(after.monitorMode,true);
 }
 const input=monitorInput(selection,{perBrandLimit:20});assert.equal(input.maxItemsPerSearch,20);
 assert.equal(input.monitorStoreName,monitorStore(selection.map(([brand])=>brand)));
 assert.equal(sourceReserve({...policy,continuous:undefined}),8.64);
 assert.equal(scanLimit({...policy,maxCostPerMonitorRunUsd:.09}),25);
});

test('one 60-row source request returns 20 matching items per brand within the existing source timeout',async()=>{
 const rows=selection.flatMap(([brand],i)=>Array.from({length:20},(_,j)=>row(brand,i*20+j)));
 let starts=0;
 const result=await monitorGroup(selection,{perBrandLimit:20,maxCostUsd:.03,token:'fixture',fetcher:async(url,o)=>{
  if(o.method==='POST'){
   starts++;assert.match(url,/maxItems=60&maxTotalChargeUsd=0.03/);assert.match(url,/timeout=120/);
   const input=JSON.parse(o.body);assert.equal(input.maxItems,60);assert.equal(input.maxItemsPerSearch,20);
   return Response.json({data:{id:'Run60',status:'SUCCEEDED',defaultDatasetId:'Data60',finishedAt:new Date(now).toISOString()}});
  }
  if(o.method==='PUT')return Response.json({data:{}});
  assert.match(url,/limit=60/);return Response.json(rows);
 }});
 assert.equal(starts,1);assert.deepEqual(result.map(r=>r.items.length),[20,20,20]);
 for(const r of result)assert(r.items.every(i=>i.brand===r.brand));
 await assert.rejects(candidateRun('topapi~vinted-scraper',{}, {token:'fixture',maxItems:60,maxCostUsd:.015}),/expanded source budget/);
});

test('skewed source output never admits more than 20 items of one brand',async()=>{
 const rows=[...Array.from({length:30},(_,i)=>row('Nonnative',i)),...Array.from({length:15},(_,i)=>row('Wacko Maria',30+i)),...Array.from({length:15},(_,i)=>row('Auralee',45+i))];
 const result=await monitorGroup(selection,{perBrandLimit:20,maxCostUsd:.03,token:'fixture',fetcher:async(url,o)=>o.method==='POST'?Response.json({data:{id:'Run60',status:'SUCCEEDED',defaultDatasetId:'Data60',finishedAt:new Date(now).toISOString()}}):o.method==='PUT'?Response.json({data:{}}):Response.json(rows)});
 assert.deepEqual(result.map(r=>r.items.length),[20,15,15]);
});

test('backend reads and exposes all 60 existing source rows without starting another scan',async()=>{
 const rows=selection.flatMap(([brand],i)=>Array.from({length:20},(_,j)=>row(brand,i*20+j)));
 const headers={Origin:'https://japansterdam.com',Authorization:'Bearer '+'a'.repeat(64)};
 const run={id:'Run60',status:'SUCCEEDED',defaultDatasetId:'Data60',startedAt:new Date(now-60000).toISOString(),finishedAt:new Date(now).toISOString()};
 const result=await reviewResults(new Request('https://radar/results',{headers}),{APIFY_TOKEN:'fixture',SHOP_API:{fetch:async()=>Response.json({})}},policy,{fetcher:async(url,o)=>{
  assert(!o.method||o.method==='GET');
  if(url.includes('/runs?'))return Response.json({data:{items:[run]}});
  assert.match(url,/limit=60/);return Response.json(rows);
 }});
 assert.equal(result.status,200);const data=await result.json();assert.equal(data.rows.length,60);assert(data.rows.some(r=>r.id==='10059'));assert.equal(data.cycleMinutes,90);
});
