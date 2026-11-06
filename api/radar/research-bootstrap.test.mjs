import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import {existingResults,runResearchTest} from './research-test.mjs';
const now=Date.now();
const policy={id:'pilot-2026-11-06',enabled:true,researchEnabled:true,researchTestOnce:true,startsAt:new Date(now-3600000).toISOString(),endsAt:new Date(now+3600000).toISOString(),maxPhotoChecks:4,dailyVisionLimit:3,brands:{Needles:'360271',Kapital:'576107'}};
const item={url:'https://www.vinted.nl/items/123456-test',title:'Needles wide track pants',brand:'Needles',price:35,currency:'EUR',condition:'very_good',available:true,observedAt:new Date(now-60000).toISOString(),photoUrls:['https://images1.vinted.net/a.png','https://images1.vinted.net/b.png'],comparables:[]};
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const migration of ['0002_radar.sql','0003_radar_transport_retry.sql','0004_radar_vision.sql','0005_radar_second_trial.sql','0006_radar_research.sql','0007_radar_research_test.sql'])db.exec(fs.readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
 db.exec('CREATE TABLE products(data TEXT NOT NULL)');db.prepare('INSERT INTO products VALUES(?)').run(JSON.stringify({brand:'Needles',name:'Needles Painter Trousers',price:210}));
 db.prepare('UPDATE radar_control SET attempts=14,last_slot=13 WHERE id=?').run(policy.id);db.prepare('UPDATE radar_vision_control SET smoke_ok=1 WHERE id=?').run(policy.id);
 let gpu=0,messages=0;
 const env={APIFY_TOKEN:'fixture',TELEGRAM_BOT_TOKEN:'123:fixture',TELEGRAM_CHAT_ID:'42',VISION_FREE_CONFIRMED:'true',AI:{async run(){gpu++;return{response:{garment_visible:true,brand_text:'Needles',brand_photo:0,care_text:'100% cotton. Made in Japan.',care_photo:1,contradiction:false,reason:'consistent_visuals'}};}},RADAR_DB:{prepare(query){return{async all(){return{results:db.prepare(query).all()};},bind(...args){const s=db.prepare(query);return{async first(){return s.get(...args)||null;},async run(){return s.run(...args);}};}};}}};
 const fetcher=async(url,init)=>{
  if(String(url).includes('vinted.net'))return new Response(new Uint8Array([0x89,0x50,0x4e,0x47]));
  assert(String(url).startsWith('https://api.telegram.org/'));assert(JSON.parse(init.body).text.startsWith('ONDERZOEK'));messages++;return Response.json({ok:true,result:{message_id:messages}});
 };
 return{db,env,fetcher,gpu:()=>gpu,messages:()=>messages};
}
test('stored-result test is atomic, sends a real-path research notice and preserves paid scan counters and existing AI limits',async()=>{
 const ctx=setup();let reads=0;
 const opts={now,clock:()=>now,fetcher:ctx.fetcher,readExisting:async()=>{reads++;return[item];}};
 const output=await Promise.all([runResearchTest(ctx.env,config,policy,opts),runResearchTest(ctx.env,config,policy,opts)]);
 const report=output.find(Boolean);assert.equal(report.state,'completed');assert.equal(report.sent,1);assert.equal(report.newScraperStarts,0);assert.equal(reads,1);assert.equal(ctx.gpu(),1);assert.equal(ctx.messages(),1);
 const control=ctx.db.prepare('SELECT attempts,last_slot,last_scan_at FROM radar_control WHERE id=?').get(policy.id);assert.equal(control.attempts,14);assert.equal(control.last_slot,13);assert.equal(control.last_scan_at,null);
 assert.equal(ctx.db.prepare('SELECT attempts FROM radar_vision_control WHERE id=?').get(policy.id).attempts,1);
 assert.equal(await runResearchTest(ctx.env,config,policy,opts),null);assert.equal(reads,1);ctx.db.close();
});
test('stored-result test stops outside the window and retains a sanitized failure without automatic retry',async()=>{
 assert.equal(await runResearchTest({},config,{...policy,endsAt:new Date(now-1).toISOString()},{now}),null);
 const ctx=setup();let reads=0;const opts={now,clock:()=>now,readExisting:async()=>{reads++;throw Error('private-fixture-token');}};
 const report=await runResearchTest(ctx.env,config,policy,opts);assert.equal(report.state,'failed');assert(!JSON.stringify(report).includes('private-fixture-token'));
 assert.equal(await runResearchTest(ctx.env,config,policy,opts),null);assert.equal(reads,1);assert.equal(ctx.gpu(),0);ctx.db.close();
});
test('stored source uses only GETs, keeps original observation times and rejects stale or missing brand datasets',async()=>{
 let calls=0;const finishedAt=new Date(now-60000).toISOString();
 const fetcher=async(raw,opts)=>{
  calls++;assert(!opts.method||opts.method==='GET');assert.equal(opts.redirect,'manual');assert(!raw.includes('token='));
  if(raw.includes('/runs?'))return Response.json({data:{items:[1,2].map(n=>({status:'SUCCEEDED',startedAt:new Date(now-120000).toISOString(),finishedAt,defaultKeyValueStoreId:'Store'+n,defaultDatasetId:'Data'+n}))}});
  if(raw.includes('/records/INPUT'))return Response.json({brandIds:raw.includes('Store1')?'360271':'576107',maxResults:10});
  return Response.json(Array.from({length:10},(_,i)=>({link:`https://www.vinted.nl/items/${1000+i}-test`,brand:raw.includes('Data1')?'Needles':'Kapital',price:35,currency:'EUR',availability:'available',condition:'Very good'})));
 };
 const rows=await existingResults('fixture',policy,{fetcher,now});assert.equal(rows.length,20);assert.equal(calls,5);assert(rows.every(row=>row.observedAt===finishedAt));
 await assert.rejects(existingResults('fixture',policy,{fetcher,now:now+2*3600000}),/missing/);
});
