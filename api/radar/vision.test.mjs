import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { screenPhotos, parseScreening, photoData, MAX_VISION_CALLS, reviewMessage } from './vision.mjs';
const now=Date.now();
const policy={enabled:true,startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+3600000).toISOString()};
const config={coreBrands:['Kapital','Needles'],peripheralBrands:[],aliases:{}};
const item={brand:'Kapital',title:'Kapital Bandana Jacket',price:20,url:'https://www.vinted.nl/items/123-fixture',photoUrls:['https://images1.vinted.net/a.png','https://images1.vinted.net/b.png']};
const raw=(change={})=>({response:JSON.stringify({garment_visible:true,brand_text:'KAPITAL',brand_photo:0,care_text:'100% cotton. Made in Japan.',care_photo:1,contradiction:false,reason:'consistent_visuals',...change})});
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../migrations/0004_radar_vision.sql',import.meta.url),'utf8'));
 let calls=0;
 const env={VISION_FREE_CONFIRMED:'true',AI:{async run(model,args){calls++;assert(model.includes('scout'));assert.equal(args.max_tokens,400);return raw();}},RADAR_DB:{prepare(query){return{bind(...args){const s=db.prepare(query);return{async first(){return s.get(...args)||null;},async run(){return s.run(...args);}};}};}}};
 return{db,env,calls:()=>calls};
}
const opts={now,clock:()=>now,fetcher:async()=>new Response(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),{headers:{'content-type':'image/png'}})};
test('photo interpretation rejects contradictory labels and stays inconclusive without readable evidence',()=>{
 assert.equal(parseScreening(raw(),item,config,2).state,'visually_consistent');
 for(const fields of [{brand_text:'Delta Plus'},{contradiction:true},{reason:'different_brand'}])assert.equal(parseScreening(raw(fields),item,config,2).state,'rejected');
 for(const fields of [{brand_photo:-1},{care_text:''},{garment_visible:false},{care_photo:99}])assert.equal(parseScreening(raw(fields),item,config,2).state,'inconclusive');
 assert.equal(parseScreening({response:'not json'},item,config,2).state,'inconclusive');
 const message=reviewMessage(item,parseScreening(raw(),item,config,2));assert(message.includes('MENSELIJKE BEOORDELING'));assert(!message.includes('/10'));assert(!message.includes('echtheid gegarandeerd'));
});
test('image requests enforce host, redirect, size and format before inference',async()=>{
 let calls=0;
 await assert.rejects(photoData('https://evil.invalid/x',async()=>{calls++;}),/HOST/);assert.equal(calls,0);
 await assert.rejects(photoData(item.photoUrls[0],async()=>new Response('',{status:302,headers:{Location:'http://127.0.0.1/'}})),/UNAVAILABLE/);
 await assert.rejects(photoData(item.photoUrls[0],async()=>new Response('html')),/FORMAT/);
 await assert.rejects(photoData(item.photoUrls[0],async()=>new Response(new Uint8Array(300000))),/LARGE/);
});
test('free account and fixed trial window are hard gates, not inferred from an available AI binding',async()=>{
 const {db,env,calls}=setup();
 assert.equal((await screenPhotos({...env,VISION_FREE_CONFIRMED:'false'},item,config,policy,opts)).state,'disabled');
 assert.equal((await screenPhotos(env,item,config,policy,{...opts,now:Date.parse(policy.endsAt)})).state,'inactive');
 assert.equal(calls(),0);db.close();
});
test('GPU budget and per-listing reservations survive overlap and failed/ambiguous requests',async()=>{
 const {db,env,calls}=setup();
 const results=await Promise.all([screenPhotos(env,item,config,policy,opts),screenPhotos(env,item,config,policy,opts)]);
 assert.equal(calls(),1);assert(results.some(x=>x.state==='visually_consistent'));
 assert.equal((await screenPhotos(env,item,config,policy,opts)).state,'visually_consistent');assert.equal(calls(),1);
 for(let i=0;i<4;i++)await screenPhotos(env,{...item,url:`https://www.vinted.nl/items/${200+i}-fixture`},config,policy,opts);
 assert.equal(calls(),MAX_VISION_CALLS);
 assert.equal(db.prepare('SELECT attempts FROM radar_vision_control').get().attempts,MAX_VISION_CALLS);db.close();
});
test('blank-image readiness must not accept hallucinated labels and model terms are never accepted automatically',async()=>{
 const {db,env,calls}=setup();
 const result=await screenPhotos(env,item,config,policy,{...opts,smoke:true});assert.equal(result.state,'unavailable');
 assert.equal(db.prepare('SELECT smoke_ok FROM radar_vision_control').get().smoke_ok,0);assert.equal(calls(),1);
 env.AI.run=async()=>{throw Error('5016 Model agreement required');};
 const denied=await screenPhotos(env,{...item,url:'https://www.vinted.nl/items/999-other'},config,policy,opts);
 assert.equal(denied.reason,'model_terms_required');db.close();
});


test('Cloudflare structured JSON objects and complete JSON fences are decoded without accepting malformed output',()=>{
 const value=JSON.parse(raw().response);
 assert.equal(parseScreening({response:value},item,config,2).state,'visually_consistent');
 assert.equal(parseScreening({response:'```json\n'+JSON.stringify(value)+'\n```'},item,config,2).state,'visually_consistent');
 assert.equal(parseScreening({response:[]},item,config,2).state,'inconclusive');
 assert.equal(parseScreening({response:{brand_text:'Kapital'}},item,config,2).state,'inconclusive');
});

test('blank-image readiness accepts structured conservative output while preserving the total attempt cap',async()=>{
 const {db,env,calls}=setup();
 env.AI.run=async()=>({response:{garment_visible:false,brand_text:'',brand_photo:-1,care_text:'',care_photo:-1,contradiction:false,reason:'not_clothing'}});
 const result=await screenPhotos(env,item,config,policy,{...opts,smoke:true});assert.equal(result.state,'ready');
 assert.equal(db.prepare('SELECT attempts FROM radar_vision_control').get().attempts,1);
 assert.equal(db.prepare('SELECT smoke_ok FROM radar_vision_control').get().smoke_ok,1);db.close();
});
