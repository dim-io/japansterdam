import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewItem,reviewResults} from './review-results.mjs';
import publicPolicy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
import {monitorInput,monitorStore} from './monitor-source.mjs';
import {candidateRun} from './source-candidates.mjs';
const token='a'.repeat(64),origin='https://japansterdam.com';
const trialStart=Date.now()-3600000,policy={...publicPolicy,id:'fixture',enabled:true,startsAt:new Date(trialStart).toISOString(),endsAt:new Date(trialStart+86400000).toISOString()};
const trialRunAt=new Date(trialStart+60000).toISOString();
const run={id:'Run1',status:'SUCCEEDED',defaultDatasetId:'Data1',startedAt:trialRunAt,finishedAt:new Date(Date.parse(trialRunAt)+3000).toISOString(),statusMessage:'Done: 1 listing'};
const row={record_type:'item',id:123,url:'https://www.vinted.nl/items/123-example',brand_title:'Needles',title:'Rebuild shirt',price_amount:35,price_currency:'EUR',uploaded_ago:'a minute ago',photo_url:'https://images1.vinted.net/photo.webp',seller_login:'private-seller',description:'not part of review response'};
test('source review requires a real shop session before reading private results',async()=>{
 let calls=0;const env={APIFY_TOKEN:'secret',SHOP_API:{fetch:async()=>{calls++;return new Response('',{status:401});}}};
 const fetcher=async()=>{throw Error('must not access source');};
 for(const headers of [{Origin:origin},{Origin:origin,Authorization:'Bearer '+token}])assert.equal((await reviewResults(new Request('https://radar/results',{headers}),env,policy,{fetcher})).status,401);
 assert.equal(calls,1);
 assert.equal((await reviewResults(new Request('https://radar/results',{headers:{Origin:'https://evil.example',Authorization:'Bearer '+token}}),env,policy,{fetcher})).status,403);
});
test('review reads bounded existing datasets, includes non-alert results, and exposes no tokens or seller data',async()=>{
 const urls=[];const env={APIFY_TOKEN:'secret',SHOP_API:{fetch:async req=>{assert.equal(req.headers.get('Authorization'),'Bearer '+token);return Response.json({user:{id:1}});}}};
 const response=await reviewResults(new Request('https://radar/results?offset=0',{headers:{Origin:origin,Authorization:'Bearer '+token}}),env,policy,{fetcher:async(url,options)=>{
  urls.push(url);assert.equal(options.redirect,'manual');assert(!options.method||options.method==='GET');assert.equal(options.headers.Authorization,'Bearer secret');
  return Response.json(url.includes('/runs?')?{data:{items:[run,{...run,id:'Empty',statusMessage:'No new listings. Nothing was charged.'}],total:2}}:[row,{...row,id:124,url:'https://www.vinted.nl/items/124-other',title:'Kapital gebreid vest',brand_title:'Kapital'}]);
 }});
 assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);assert.match(response.headers.get('Cache-Control'),/no-store/);
 const data=await response.json();assert.equal(data.rows.length,2);assert.equal(data.rows[0].title,'Needles — Rebuild shirt');assert.equal(data.nextOffset,null);assert.equal(urls.length,2);assert.deepEqual(data.runIds,['Run1','Empty']);assert.equal(data.sourceMode,'new-only');
 const serialized=JSON.stringify(data);for(const text of ['secret',token,'private-seller','not part of review'])assert(!serialized.includes(text));
 assert(!data.selectedBrands.includes('Kenzo'));assert(!data.selectedBrands.includes('Evisu'));assert(!data.selectedBrands.includes('Maison Kitsuné'));
});
test('review refuses unsafe links, retains unknown upload time and omits non-item rows',()=>{
 assert.equal(reviewItem({...row,url:'https://evil.example/items/123'},run),null);
 assert.equal(reviewItem({...row,record_type:'seller'},run),null);
 const item=reviewItem({...row,uploaded_ago:'unknown',photo_url:'https://evil.example/p.png'},run);assert.equal(item.image,null);assert.equal(item.uploadedAt,null);
});
test('review distinguishes estimated placement from a later source check',()=>{
 const item=reviewItem({...row,scraped_at:'2026-11-17T19:59:00Z',uploaded_ago:'an hour ago'},run);
 assert.equal(item.uploadedAt,'2026-11-17T18:59:00.000Z');assert.equal(item.uploadTimeKind,'estimated');assert.equal(item.uploadPrecision,'hour');assert.equal(item.observedAt,run.finishedAt);
 const exact=reviewItem({...row,published_at:'2026-11-17T19:30:00Z'},run);assert.equal(exact.uploadTimeKind,'exact');
});
test('all requested favorites remain selected and Rebuild is an explicit search within the existing Needles monitor',()=>{
 for(const brand of ['orSlow','Fullcount','Auralee','Sage de Cret','Nonnative','Nanamica','Engineered Garments','Ts(s)','Remi Relief','Needles','WTAPS','Uniform Experiment','Fragment Design','Wacko Maria','Denim by Vanquish & Fragment','Ordinary Fits','Fumito Ganryu','Visvim'])assert(brand in policy.brands,brand);
 const group=policy.brandGroups.find(g=>g.includes('Needles'));const input=monitorInput(group.map(b=>[b,policy.brands[b]]));assert(input.searchQueries.includes('Rebuild by Needles'));assert.equal(input.monitorStoreName,monitorStore(group));assert.equal(input.resetMonitor,false);
});
test('run labels name every searched brand without modifying access or starting a second run',async()=>{
 const requests=[];
 const result=await candidateRun('topapi~vinted-scraper',{}, {token:'fixture',runLabel:'Japansterdam — Kapital + Needles',fetcher:async(url,o)=>{
  requests.push([url,o]);if(o.method==='POST')return Response.json({data:run});
  if(o.method==='PUT'){const b=JSON.parse(o.body);assert.match(b.statusMessage,/Kapital \+ Needles/);assert(!('generalAccess' in b));return Response.json({data:run});}
  return Response.json([row]);
 }});
 assert.equal(result.rows.length,1);assert.equal(requests.filter(([,o])=>o.method==='POST').length,1);assert.equal(requests.filter(([,o])=>o.method==='PUT').length,1);
});
