import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker, { scan, wake, status, inWindow, PILOT_ID } from './worker.mjs';
const now = Date.now();
const policy = { enabled: true, startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 23*3600000).toISOString(), maxAttempts: 25, brands: { Kapital: '576107', Needles: '360271' } };
function setup(attempts = 0) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0002_radar.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO radar_control (id,attempts) VALUES (?,?)').run(PILOT_ID,attempts);
  const env = { APIFY_TOKEN: 'test-key', TELEGRAM_BOT_TOKEN: '123:token', TELEGRAM_CHAT_ID: '42', RADAR_DB: {
    prepare(query) { return { bind(...args) { const s=db.prepare(query); return { async first(){ return s.get(...args)||null; }, async run(){ return s.run(...args); } }; } }; },
  } };
  return { db, env };
}
const product = { name: 'Needles Painter Trousers', brand:'Needles', price:210 };
const item = { title: product.name, brand:'Needles', price:10, currency:'EUR', condition:'very_good', available:true, observedAt:new Date(now).toISOString(), url:'https://www.vinted.nl/items/123456-test', comparables:[] };
const options = { now, policy, clock: () => now };

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
  const output=JSON.stringify(await status(env));assert(!output.includes('test-key'));assert(!output.includes('123:token'));
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


test('shop inventory uses the internal service binding instead of a workers.dev subrequest',async()=>{
  const {db,env}=setup();let internal=0;
  env.SHOP_API={async fetch(request){internal++;assert.equal(new URL(request.url).pathname,'/public/products');return Response.json([product]);}};
  const report=await scan(env,{...options,fetcher:async()=>{throw Error('Public worker-to-worker fetch must not be used');},probeFn:async()=>({runId:'internal',items:[]})});
  assert.equal(internal,1);assert.equal(report.attempts,1);db.close();
});
