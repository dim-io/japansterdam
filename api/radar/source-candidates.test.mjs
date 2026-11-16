import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateRun,candidateInput,candidates} from './source-candidates.mjs';
test('candidate inputs request newest-first and no notifications, sellers or reviews',()=>{
 const a=candidateInput(candidates[0],'Needles');assert.equal(new URL(a.startUrls[0]).searchParams.get('order'),'newest_first');assert.equal(a.maxProducts,10);assert.deepEqual(a.webhookUrls,[]);
 const b=candidateInput(candidates[1],'Needles',{monitor:true});assert.equal(b.order,'newest_first');assert.equal(b.monitorMode,true);assert.equal(b.alertOnPriceDrop,false);assert.equal(b.resetMonitor,false);assert.equal(b.includeSellerDetails,false);assert.equal(b.maxItems,10);
});
test('source acceptance uses capped authenticated requests and rejects redirects',async()=>{
 let starts=0;const result=await candidateRun(candidates[0],candidateInput(candidates[0],'Needles'),{token:'fixture',fetcher:async(url,o)=>{
  assert.equal(o.redirect,'manual');assert.equal(o.headers.Authorization,'Bearer fixture');assert(!url.includes('fixture'));
  if(o.method==='POST'){starts++;assert(url.includes('maxTotalChargeUsd=.03'));assert(url.includes('maxItems=10'));return Response.json({data:{id:'Run1',status:'SUCCEEDED',defaultDatasetId:'Data1'}});}
  return Response.json([{id:123,title:'shirt'}]);
 }});assert.equal(starts,1);assert.equal(result.rows.length,1);
 await assert.rejects(candidateRun('unapproved~actor',{}, {token:'fixture'}),/Invalid source trial/);
 await assert.rejects(candidateRun(candidates[0],{}, {token:'fixture',fetcher:async()=>new Response(null,{status:302})}),/source_http_302/);
});
