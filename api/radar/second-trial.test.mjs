import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {scan,inWindow,status} from './worker.mjs';
import {screenPhotos} from './vision.mjs';
import {budgetDecision} from '../../tools/deal-radar/budget.mjs';
import {compareCatalog} from './freshness.mjs';
const now=Date.now(),start=Math.floor(now/3600000)*3600000;
const policy={id:'pilot-2026-11-06',enabled:true,mode:'both-brands',startsAt:new Date(start).toISOString(),endsAt:new Date(start+86400000).toISOString(),maxAttempts:24,maxResultsPerBrand:10,maxPhotoChecks:4,dailyVisionLimit:3,brands:{Kapital:'576107',Needles:'360271'}};
const user={data:{isPaying:false,plan:{tier:'FREE',monthlyBasePriceUsd:0,monthlyUsageCreditsUsd:5}}};
const limits={data:{limits:{maxMonthlyUsageUsd:5},current:{monthlyUsageUsd:0}}};
const fetcher=async(url)=>String(url).endsWith('/users/me')?Response.json(user):String(url).endsWith('/limits')?Response.json(limits):new Response('',{status:403});
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0002_radar.sql','0003_radar_transport_retry.sql','0004_radar_vision.sql','0005_radar_second_trial.sql'])db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.exec('CREATE TABLE products(data TEXT NOT NULL)');db.prepare('INSERT INTO products VALUES(?)').run(JSON.stringify({name:'Needles Painter Trousers',brand:'Needles',price:210}));
 const env={APIFY_TOKEN:'fixture',TELEGRAM_BOT_TOKEN:'123:fixture',TELEGRAM_CHAT_ID:'42',RADAR_DB:{prepare(query){return{async all(){return{results:db.prepare(query).all()};},bind(...args){const s=db.prepare(query);return{async first(){return s.get(...args)||null;},async run(){return s.run(...args);},async all(){return{results:s.all(...args)};}};}};}}};
 return{db,env};
}
test('second trial checks both brands each hour, at most 48 provider starts, with stable bounds',async()=>{
 const {db,env}=setup();const calls=[];
 const probeFn=async(args)=>{calls.push(args);return{runId:'fixture',items:[]};};
 const opts={policy,now:start+1000,clock:()=>start+1000,fetcher,probeFn};
 const [a,b]=await Promise.all([scan(env,opts),scan(env,opts)]);
 assert.equal(calls.length,2);assert([a,b].some(r=>r.skipped));
 for(let i=1;i<24;i++)await scan(env,{...opts,now:start+i*3600000+1000,clock:()=>start+i*3600000+1000});
 assert.equal(calls.length,48);
 assert(calls.every(c=>c.maxResults===10&&c.maxCostUsd===.03));
 assert.deepEqual(calls.slice(0,2).map(c=>c.brandIds),['576107','360271']);
 assert.equal((await scan(env,{...opts,now:start+86400000,clock:()=>start+86400000})).inactive,true);
 assert.equal(calls.length,48);
 const output=await status(env,start+24*3600000,policy);assert.equal(output.active,false);assert.equal(output.attempts,24);assert.equal(output.brandsPerHour,2);db.close();
});
test('unknown, paid or insufficient free credit prevents every provider start',async()=>{
 for(const data of [{...user,data:{...user.data,plan:{...user.data.plan,tier:'STARTER',monthlyBasePriceUsd:29}}},user]){
  const {db,env}=setup();let calls=0;
  const low={data:{...limits.data,current:{monthlyUsageUsd:4.9}}};
  await assert.rejects(scan(env,{policy,now,clock:()=>now,probeFn:async()=>{calls++;},fetcher:async(url)=>Response.json(String(url).endsWith('/users/me')?data:low)}),/BUDGET/);
  assert.equal(calls,0);assert.equal(db.prepare('SELECT attempts FROM radar_control WHERE id=?').get(policy.id).attempts,0);db.close();
 }
 assert.equal(budgetDecision(user,limits).enoughCredit,true);
 assert.equal(budgetDecision({},limits).enoughCredit,false);
});
test('public snapshot comparison distinguishes matches, differences and unavailable evidence',async()=>{
 const items=['123','456','789'].map(id=>({url:'https://www.vinted.nl/items/'+id+'-piece'}));
 const html=ids=>new Response(ids.map(id=>`<a href="/items/${id}-piece">Piece</a>`).join(''),{headers:{'Content-Type':'text/html'}});
 assert.equal((await compareCatalog('360271',items,async()=>html(['123','456','789']))).state,'consistent_snapshot');
 assert.equal((await compareCatalog('360271',items,async()=>html(['456','123','789']))).state,'different_snapshot');
 assert.equal((await compareCatalog('360271',items,async()=>new Response('',{status:403}))).state,'unverified');
});
test('photo budgets preserve prior daily usage, survive midnight, and cap the second trial at four calls',async()=>{
 const {db,env}=setup();let calls=0;
 env.VISION_FREE_CONFIRMED='true';env.AI={async run(){calls++;return{response:{garment_visible:false,brand_text:'',brand_photo:-1,care_text:'',care_photo:-1,contradiction:false,reason:'uncertain'}};}};
 const day=new Date(now).toISOString().slice(0,10);db.prepare('INSERT INTO radar_vision_daily VALUES(?,2)').run(day);
 const photoPolicy={...policy,startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+86300000).toISOString()};
 const nextDay=(Math.floor(now/86400000)+1)*86400000;
 const photos=['https://images1.vinted.net/a.png','https://images1.vinted.net/b.png'];
 const opts=time=>({now:time,clock:()=>time,fetcher:async()=>new Response(new Uint8Array([0x89,0x50,0x4e,0x47]))});
 const item=i=>({url:`https://www.vinted.nl/items/${i}-test`,brand:'Kapital',title:'test',photoUrls:photos});
 await screenPhotos(env,item(100),{},photoPolicy,opts(now));
 assert.equal(calls,1);
 assert.equal((await screenPhotos(env,item(101),{},photoPolicy,opts(now))).reason,'daily_photo_budget_reached');
 for(let i=102;i<106;i++)await screenPhotos(env,item(i),{},photoPolicy,opts(nextDay));
 assert.equal(calls,4);assert.equal(db.prepare('SELECT attempts FROM radar_vision_control WHERE id=?').get(policy.id).attempts,4);
 assert.equal(db.prepare('SELECT MAX(attempts) AS n FROM radar_vision_daily').get().n,3);db.close();
});
