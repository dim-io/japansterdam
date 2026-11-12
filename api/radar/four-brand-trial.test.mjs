import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {scan,scanSelection,status} from './worker.mjs';
import {bootstrapTrial} from './bootstrap-trial.mjs';
import {SOURCE} from './account-migration.mjs';
import {itemPriceLimit,assess} from '../../tools/deal-radar/scoring.mjs';
import {normalizeRow,probe} from '../../tools/deal-radar/provider.mjs';
import {freePlanDecision} from './free-plan.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import current from '../../tools/deal-radar/pilot-v3.json' with {type:'json'};
import readiness from './owner-readiness.json' with {type:'json'};
const now=Date.now(),p={...current,brands:{Kapital:'576107',Needles:'360271','Engineered Garments':'609050',orSlow:'373463'},brandGroups:[['Needles','orSlow'],['Kapital','Engineered Garments']],previousPilotId:'pilot-2026-11-06',startsAt:new Date(now).toISOString(),endsAt:new Date(now+86400000).toISOString()};
test('only the two premium brands get seventy euros, consistently at normalization and assessment',()=>{
 for(const [brand,limit] of [['Needles',70],['Kapital',70],['Kountry',70],['Engineered Garments',40],['Orslow',40]]){
  assert.equal(itemPriceLimit(brand,config),limit);
  assert.match(assess({url:'https://www.vinted.nl/items/123-test',brand,price:limit+.01,currency:'EUR'},config,now).reason,new RegExp('€'+limit));
 }
 const row={link:'https://www.vinted.nl/items/123-test',brand:'Needles',price:65,currency:'EUR'};
 assert.equal(normalizeRow(row,'',40),null);assert.equal(normalizeRow(row,'',70).price,65);
 assert.equal(normalizeRow({...row,price:70.01},'',70),null);
 assert.equal(normalizeRow(row,'',999),null);
});
test('seventy-euro search agrees across actor input, catalog URL and returned data',async()=>{
 const calls=[];
 const result=await probe({token:'fixture',maxPrice:70,maxResults:10,maxCostUsd:.03,fetcher:async(url,options)=>{
  calls.push([url,options]);
  if(options.method==='POST'){
   const input=JSON.parse(options.body);assert.equal(input.maxPrice,70);assert.equal(new URL(input.searchQueries[0]).searchParams.get('price_to'),'70');
   return Response.json({data:{id:'run123',status:'SUCCEEDED',defaultDatasetId:'data123',finishedAt:new Date(now).toISOString()}});
  }
  return Response.json([65,70.01].map((price,i)=>({link:`https://www.vinted.nl/items/${100+i}-piece`,brand:'Needles',price,currency:'EUR'})));
 }});
 assert.equal(result.items.length,1);assert.equal(result.items[0].price,65);assert.equal(calls.length,2);
});
test('new phase preserves history and daily budgets, checks each brand twelve times and stops at forty-eight provider calls',async()=>{
 const db=new DatabaseSync(':memory:');
 for(const name of ['0002_radar.sql','0003_radar_transport_retry.sql','0004_radar_vision.sql','0005_radar_second_trial.sql','0006_radar_research.sql','0007_radar_research_test.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.exec('CREATE TABLE radar_transfer (id TEXT,verified INTEGER); CREATE TABLE products(data TEXT)');
 db.prepare('INSERT INTO radar_transfer VALUES (?,1)').run(SOURCE.database);
 db.prepare('UPDATE radar_control SET attempts=24 WHERE id=?').run(p.previousPilotId);
 db.prepare('INSERT INTO radar_vision_control (id,smoke_ok) VALUES (?,1)').run(readiness.id);
 db.prepare('INSERT INTO radar_photo_checks VALUES (?,?,?,?,?,?)').run(readiness.id,'smoke-v2','empty-pixel-regression-v2','ready','{}',now);
 db.prepare('INSERT INTO radar_alerts VALUES (?,?,?,?,?,?)').run(p.previousPilotId,'photo-review:123',35,'sent',777,now-1000);
 db.prepare('INSERT INTO radar_vision_daily VALUES (?,1)').run(new Date(now).toISOString().slice(0,10));
 db.prepare('INSERT INTO products VALUES (?)').run(JSON.stringify({name:'Needles jacket',brand:'Needles',price:200}));
 const query=async(sql,params=[])=>{const s=db.prepare(sql);return s.columns().length?s.all(...params):(s.run(...params),[]);};
 await bootstrapTrial(query,p,now);
 assert.equal(db.prepare('SELECT message_id FROM radar_alerts WHERE pilot_id=?').get(p.id).message_id,777);
 assert.equal(db.prepare('SELECT attempts FROM radar_vision_daily').get().attempts,1);
 const counts={};let calls=0;
 const env={APIFY_TOKEN:'fixture',TELEGRAM_BOT_TOKEN:'123:fixture',TELEGRAM_CHAT_ID:'42',RADAR_DB:{prepare(sql){return {bind(...params){return {async first(){return (await query(sql,params))[0]||null;},async run(){await query(sql,params);},async all(){return {results:await query(sql,params)};}};},async all(){return {results:await query(sql)};}};}}};
 const fetcher=async(url)=>url.endsWith('/users/me')?Response.json({data:{isPaying:false,plan:{tier:'FREE',monthlyBasePriceUsd:0,monthlyUsageCreditsUsd:5}}}):url.endsWith('/limits')?Response.json({data:{limits:{maxMonthlyUsageUsd:5},current:{monthlyUsageUsd:0}}}):new Response('',{status:403});
 for(let i=0;i<24;i++){
  const time=now+i*3600000;
  await scan(env,{policy:p,now:time,clock:()=>time,fetcher,probeFn:async opts=>{
   calls++;const brand=Object.keys(p.brands).find(b=>p.brands[b]===opts.brandIds);counts[brand]=(counts[brand]||0)+1;
   assert.equal(opts.maxPrice,itemPriceLimit(brand,config));assert.equal(opts.maxCostUsd,.03);return {runId:'fixture',items:[]};
  }});
 }
 assert.equal(calls,48);assert(Object.values(counts).every(n=>n===12));assert.equal(Object.keys(counts).length,4);
 const out=await status(env,now+86400000,p);assert.equal(out.active,false);assert.equal(out.attempts,24);assert.equal(out.scanIntervalHours,2);
 assert((await bootstrapTrial(query,p,now+86400000)).alreadyInitialized);
 assert.equal(db.prepare('SELECT attempts FROM radar_control WHERE id=?').get(p.previousPilotId).attempts,24);
 assert.equal(db.prepare('SELECT attempts FROM radar_control WHERE id=?').get(p.id).attempts,24);
 assert.throws(()=>scanSelection({...p,brandGroups:[['Kapital'],['Needles']]},0),/merkschema/);db.close();
});
test('current account confirmation is scoped to this new trial and dashboard proof',()=>{
 assert.equal(freePlanDecision({status:403},current,Date.parse(current.startsAt)).allowed,true);
 assert.equal(freePlanDecision({status:403},current,Date.parse(current.endsAt)).allowed,false);
});
