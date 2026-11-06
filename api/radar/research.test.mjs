import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import {researchCandidate,researchText} from './research.mjs';
import {selectPhotoUrls} from './vision.mjs';
import {scan,status} from './worker.mjs';
const now=Date.now();
const policy={id:'pilot-2026-11-06',enabled:true,researchEnabled:true,startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+23*3600000).toISOString(),maxAttempts:24,maxPhotoChecks:4,dailyVisionLimit:3,brands:{Needles:'360271'}};
const item={title:'Needles wide track pants',brand:'Needles',price:35,currency:'EUR',size:'XL',condition:'very_good',available:true,description:'',observedAt:new Date(now).toISOString(),url:'https://www.vinted.nl/items/123456-test',photoUrls:['https://images1.vinted.net/front.png','https://images1.vinted.net/label.png'],comparables:[]};
function setup(outcome='consistent',failure=false){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0002_radar.sql','0003_radar_transport_retry.sql','0004_radar_vision.sql','0005_radar_second_trial.sql','0006_radar_research.sql'])db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.exec('CREATE TABLE products(data TEXT NOT NULL)');db.prepare('INSERT INTO products VALUES(?)').run(JSON.stringify({name:'Needles Painter Trousers',brand:'Needles',price:210}));
 db.prepare('UPDATE radar_vision_control SET smoke_ok=1 WHERE id=?').run(policy.id);
 const messages=[];let calls=0;
 const env={APIFY_TOKEN:'fixture',TELEGRAM_BOT_TOKEN:'123:fixture',TELEGRAM_CHAT_ID:'42',VISION_FREE_CONFIRMED:'true',
  AI:{async run(){calls++;return{response:{garment_visible:true,brand_text:outcome==='rejected'?'Other brand':'Needles',brand_photo:0,care_text:outcome==='unclear'?'':'100% cotton. Made in Japan.',care_photo:outcome==='unclear'?-1:1,contradiction:outcome==='rejected',reason:outcome==='rejected'?'different_brand':outcome==='unclear'?'labels_missing':'consistent_visuals'}};}},
  RADAR_DB:{prepare(query){return{async all(){return{results:db.prepare(query).all()};},bind(...args){const s=db.prepare(query);return{async first(){return s.get(...args)||null;},async run(){return s.run(...args);},async all(){return{results:s.all(...args)};}};}};}}};
 const fetcher=async(url,init)=>{
  if(String(url).includes('vinted.net'))return new Response(new Uint8Array([0x89,0x50,0x4e,0x47]));
  messages.push(JSON.parse(init.body).text);return failure?Response.json({ok:false},{status:500}):Response.json({ok:true,result:{message_id:messages.length}});
 };
 return {db,env,messages,calls:()=>calls,fetcher};
}
const options=(ctx,changes={})=>({now,clock:()=>now,policy,fetcher:ctx.fetcher,probeFn:async()=>({runId:'fixture',items:[item]}),...changes});
test('unpriced research keeps availability, condition, freshness, brand identity and counterfeit gates',()=>{
 assert(researchCandidate(item,config,now));
 for(const patch of [{price:41},{price:0},{currency:'GBP'},{available:false},{condition:'satisfactory'},{flaws:['hole']},{title:'Needles replica track pants'},{description:'Uniqlo collaboration'},{title:'Needles child jacket'},{title:'Work jacket',brand:'Kapital'},{title:'Needles handmade scarf'},{observedAt:new Date(now-2*3600000).toISOString()},{photoUrls:[]}])assert.equal(researchCandidate({...item,...patch},config,now),null,JSON.stringify(patch));
 const blocked={...config,authenticityReviews:{123456:{brand:'Needles',verdict:'brand_mismatch'}}};assert.equal(researchCandidate(item,blocked,now),null);
 const value=researchText(item,{state:'inconclusive'});assert(value.includes('Verkoopwaarde en marge: onbekend'));assert(value.includes('Authenticiteit: niet bevestigd'));assert(!value.includes('/10'));
});
test('unpriced items enter the queue and send a distinct human research notice, never an eligible deal',async()=>{
 const ctx=setup();const report=await scan(ctx.env,options(ctx));
 assert.equal(report.sent,0);assert.equal(report.researchQueued,1);assert.equal(report.researchSent,1);assert.equal(report.decisions[0].score,null);assert.equal(report.decisions[0].authenticity,'unreviewed');
 assert(ctx.messages[0].startsWith('ONDERZOEK — GEEN KOOPADVIES'));assert(ctx.messages[0].includes('onbekend'));assert(!ctx.messages[0].includes('/10'));
 await scan(ctx.env,options(ctx,{now:now+3600000,clock:()=>now+3600000,probeFn:async()=>({runId:'again',items:[{...item,observedAt:new Date(now+3600000).toISOString()}]})}));
 assert.equal(ctx.messages.length,1);assert.equal(ctx.calls(),1);
 const publicStatus=JSON.stringify(await status(ctx.env,now,policy));assert(publicStatus.includes('researchEnabled'));assert(!publicStatus.includes('123456'));assert(!publicStatus.includes(item.title));ctx.db.close();
});
test('unreadable labels request manual evidence; contradictory labels never produce research alerts',async()=>{
 for(const outcome of ['unclear','rejected']){
  const ctx=setup(outcome);const report=await scan(ctx.env,options(ctx));
  assert.equal(report.sent,0);assert.equal(report.researchSent,outcome==='unclear'?1:0);
  if(outcome==='unclear')assert(ctx.messages[0].includes('Vraag duidelijke labelfoto'));
  else assert.equal(ctx.db.prepare('SELECT state FROM radar_research').get().state,'rejected');ctx.db.close();
 }
});
test('the research route shares the existing GPU limits, caps notices at two and does not reset counters',async()=>{
 const ctx=setup();const items=[1,2,3].map(id=>({...item,url:`https://www.vinted.nl/items/${id}-test`}));
 const report=await scan(ctx.env,options(ctx,{probeFn:async()=>({runId:'fixture',items})}));
 assert.equal(ctx.calls(),3);assert.equal(report.researchSent,2);assert.equal(ctx.messages.length,2);
 assert.equal(ctx.db.prepare('SELECT attempts FROM radar_research_limits').get().attempts,2);
 assert.equal(ctx.db.prepare('SELECT attempts FROM radar_vision_control WHERE id=?').get(policy.id).attempts,3);ctx.db.close();
 const blocked=setup();blocked.db.prepare('UPDATE radar_vision_control SET attempts=4 WHERE id=?').run(policy.id);
 const waiting=await scan(blocked.env,options(blocked));assert.equal(waiting.researchQueued,1);assert.equal(waiting.researchSent,0);assert.equal(blocked.calls(),0);assert.equal(blocked.db.prepare('SELECT state FROM radar_research').get().state,'queued');blocked.db.close();
});
test('an ambiguous Telegram failure remains reserved and is not retried after another hourly scan',async()=>{
 const ctx=setup('consistent',true);await assert.rejects(scan(ctx.env,options(ctx)));
 await scan(ctx.env,options(ctx,{now:now+3600000,clock:()=>now+3600000,probeFn:async()=>({runId:'again',items:[{...item,observedAt:new Date(now+3600000).toISOString()}]})}));
 assert.equal(ctx.messages.length,1);assert.equal(ctx.db.prepare('SELECT state FROM radar_research').get().state,'notification_pending');ctx.db.close();
});
test('the photo selection includes the cover and final label photos without increasing the four-image limit',()=>{
 const photos=Array.from({length:7},(_,i)=>`https://images1.vinted.net/${i}.png`);
 assert.deepEqual(selectPhotoUrls(photos),[photos[0],...photos.slice(-3)]);
 assert.deepEqual(selectPhotoUrls([...photos.slice(0,2),'https://foreign.example/x.png']),photos.slice(0,2));
});
