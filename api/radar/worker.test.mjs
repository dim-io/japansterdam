import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker, { scan, wake, status, inWindow, PILOT_ID } from './worker.mjs';
import { fixtureReviews, photoFixture } from '../../tools/deal-radar/auth-fixture.mjs';
const now = Date.now();
const policy = { enabled: true, startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 23*3600000).toISOString(), maxAttempts: 25, brands: { Kapital: '576107', Needles: '360271' } };
function setup(attempts = 0) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0002_radar.sql', import.meta.url), 'utf8'));
  db.exec(fs.readFileSync(new URL('../migrations/0003_radar_transport_retry.sql', import.meta.url), 'utf8'));
  db.exec(fs.readFileSync(new URL('../migrations/0004_radar_vision.sql', import.meta.url), 'utf8'));
  db.exec('CREATE TABLE products (data TEXT NOT NULL)');
  db.prepare('INSERT INTO products (data) VALUES (?)').run(JSON.stringify({ name: 'Needles Painter Trousers', brand: 'Needles', price: 210 }));
  db.prepare('INSERT INTO radar_control (id,attempts) VALUES (?,?)').run(PILOT_ID,attempts);
  const env = { APIFY_TOKEN: 'test-key', TELEGRAM_BOT_TOKEN: '123:token', TELEGRAM_CHAT_ID: '42', RADAR_DB: {
    prepare(query) { return { async all(){return {results:db.prepare(query).all()};}, bind(...args) { const s=db.prepare(query); return { async first(){ return s.get(...args)||null; }, async run(){ return s.run(...args); }, async all(){ return {results:s.all(...args)}; } }; } }; },
  } };
  return { db, env };
}
const product = { name: 'Needles Painter Trousers', brand:'Needles', price:210 };
const item = { title: product.name, brand:'Needles', price:10, currency:'EUR', condition:'very_good', available:true, observedAt:new Date(now).toISOString(), url:'https://www.vinted.nl/items/123456-test', comparables:[], photoUrls:photoFixture };
const options = { authenticityReviews: fixtureReviews(item, now), now, policy, clock: () => now };

test('hard end and malformed windows stop before credentials, database or provider access', async()=>{
  assert.equal(inWindow(Date.parse(policy.endsAt),policy),false);
  assert.equal(inWindow(now,{...policy,endsAt:new Date(now+25*3600000).toISOString()}),false);
  assert((await scan({}, {...options, now:Date.parse(policy.endsAt)})).inactive);
});
test('atomic hour reservation serializes overlapping events and caps total spending across redeploys', async()=>{
  const {db,env}=setup(3);let scans=0;
  const opts={...options,fetcher:async()=>Response.json([product]),probeFn:async()=>{scans++;return {runId:'test',items:[]};}};
  const results=await Promise.all([scan(env,opts),scan(env,opts)]);
  assert.equal(scans,1);assert.equal(results.filter(x=>x.skipped).length,1);
  assert.equal(db.prepare('SELECT attempts FROM radar_control').get().attempts,4);
  db.prepare('UPDATE radar_control SET attempts=25').run();
  assert((await scan(env,{...opts,now:now+3600000,clock:()=>now+3600000})).skipped);
  assert.equal(scans,1);db.close();
});
test('failed provider leaves the hour reserved and public status exposes no credentials or listings',async()=>{
  const {db,env}=setup();let scans=0;
  const opts={...options,fetcher:async()=>Response.json([product]),probeFn:async()=>{scans++;throw Error('test-key');}};
  await assert.rejects(wake(env,opts),/Radarcontrole niet voltooid/);
  assert((await scan(env,opts)).skipped);assert.equal(scans,1);
  const output=JSON.stringify(await status(env,now,policy));assert(!output.includes('test-key'));assert(!output.includes('123:token'));
  assert(output.includes('Scan niet voltooid'));db.close();
});
test('real SQL preserves delivery history and suppresses repeats, including ambiguous Telegram failures',async()=>{
  const {db,env}=setup(1);let messages=0;
  const opts={...options,fetcher:async(url)=>{
    if(String(url).includes('workers.dev'))return Response.json([product]);
    messages++;return Response.json({ok:true,result:{message_id:messages}});
  },probeFn:async()=>({runId:'test',items:[item,item]})};
  const first=await scan(env,opts);assert.equal(first.sent,1);assert.equal(messages,1);
  // Every second attempt is Needles; a redeploy cannot reset the persisted alert.
  await scan(env,{...opts,now:now+3600000,clock:()=>now+3600000});
  await scan(env,{...opts,now:now+7200000,clock:()=>now+7200000,probeFn:async()=>({runId:'again',items:[{...item,observedAt:new Date(now+7200000).toISOString()}]})});
  assert.equal(messages,1);
  const row=db.prepare('SELECT * FROM radar_alerts').get();assert.equal(row.delivery,'sent');assert.equal(row.message_id,1);
  db.prepare('DELETE FROM radar_alerts').run();
  db.prepare('UPDATE radar_control SET attempts=5').run();
  await assert.rejects(wake(env,{...opts,now:now+14400000,clock:()=>now+14400000,
    probeFn:async()=>({runId:'failed-delivery',items:[{...item,observedAt:new Date(now+14400000).toISOString()}]}),
    fetcher:async(url)=>String(url).includes('workers.dev')?Response.json([product]):Response.json({ok:false},{status:500})}));
  assert.equal(db.prepare('SELECT delivery FROM radar_alerts').get().delivery,'pending');db.close();
});
test('HTTP interface is read-only and cannot start or reconfigure a scan',async()=>{
  const {db,env}=setup();
  assert.equal((await worker.fetch(new Request('https://radar/status',{method:'POST'}),env)).status,404);
  assert.equal((await worker.fetch(new Request('https://radar/run'),env)).status,404);
  assert.equal((await worker.fetch(new Request('https://radar/status'),env)).status,200);db.close();
});


test('valuation reads only public catalog fields from D1 without an outbound inventory fetch',async()=>{
  const {db,env}=setup();
  const report=await scan(env,{...options,fetcher:async()=>{throw Error('Inventory HTTP fetch must not be used');},probeFn:async()=>({runId:'internal',items:[]})});
  assert.equal(report.attempts,1);db.close();
});


test('one-time pre-network transport recovery is consumed atomically without resetting the budget',async()=>{
  const {db,env}=setup(4);let calls=0;
  db.prepare('UPDATE radar_control SET last_slot=?,transport_retry=1').run(Math.floor(now/3600000));
  const opts={...options,probeFn:async()=>{calls++;return {runId:'recovery',items:[]};}};
  await Promise.all([scan(env,opts),scan(env,opts)]);
  assert.equal(calls,1);
  const row=db.prepare('SELECT attempts,transport_retry FROM radar_control').get();
  assert.equal(row.attempts,5);assert.equal(row.transport_retry,0);db.close();
});

test('visual triage sends only a human-review notice and never grants authentication or a deal score',async()=>{
  const {db,env}=setup(1);let gpu=0,messages=[];
  env.VISION_FREE_CONFIRMED='true';
  env.AI={async run(){gpu++;return {response:JSON.stringify({garment_visible:true,brand_text:'Needles',brand_photo:0,care_text:'100% cotton. Made in Japan.',care_photo:1,contradiction:false,reason:'consistent_visuals'})};}};
  db.prepare('UPDATE radar_vision_control SET smoke_ok=1').run();
  const report=await scan(env,{...options,authenticityReviews:{},probeFn:async()=>({runId:'photo-test',items:[item]}),fetcher:async(url,init)=>{
    if(String(url).includes('vinted.net'))return new Response(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    messages.push(JSON.parse(init.body).text);return Response.json({ok:true,result:{message_id:1}});
  }});
  assert.equal(gpu,1);assert.equal(report.sent,0);assert.equal(report.photoReviewSent,1);
  assert.equal(report.decisions[0].score,null);assert.equal(report.decisions[0].authenticity,'unreviewed');
  assert(messages[0].startsWith('FOTOCHECK'));assert(messages[0].includes('MENSELIJKE BEOORDELING'));assert(!messages[0].includes('/10'));
  db.close();
});
