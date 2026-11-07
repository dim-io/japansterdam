import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {allowed,check} from './owner-readiness.mjs';
import {TARGET,SOURCE} from './account-migration.mjs';
function setup(){
  const db=new DatabaseSync(':memory:');
  for(const file of ['0002_radar.sql','0003_radar_transport_retry.sql','0004_radar_vision.sql','0005_radar_second_trial.sql','0006_radar_research.sql','0007_radar_research_test.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  db.exec('CREATE TABLE radar_transfer (id TEXT,verified INTEGER)');db.prepare('INSERT INTO radar_transfer VALUES (?,1)').run(SOURCE.database);
  db.prepare('UPDATE radar_control SET attempts=24').run();
  const query=async(sql,params=[])=>{const s=db.prepare(sql);return s.columns().length?s.all(...params):(s.run(...params),[]);};
  const now=Date.now(),testPolicy={enabled:true,id:'owner-readiness-fixture',accountId:TARGET.account,maxPhotoChecks:1,dailyVisionLimit:3,startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+3599000).toISOString(),freeAccountEvidence:{plan:'free',source:'dashboard_current_plan',confirmedAt:new Date(now-1000).toISOString()}};
  return {db,query,now,testPolicy};
}
test('expired readiness window or wrong account stops before database and external access',async()=>{
  const {db,testPolicy,now}=setup();
  assert(allowed(testPolicy,now));
  for(const p of [{...testPolicy,accountId:'other'},{...testPolicy,maxPhotoChecks:2},{...testPolicy,endsAt:new Date(now).toISOString()},{...testPolicy,freeAccountEvidence:{plan:'paid'}}]){
    assert(!allowed(p,now));await assert.rejects(check({}, {testPolicy:p,now,query(){throw Error('must not read');},fetcher(){throw Error('must not fetch');}}),/window_closed/);
  }db.close();
});
test('one real inference reservation is shared across retries; scraper and delivery counters remain untouched',async()=>{
  const {db,query,testPolicy,now}=setup();let gpu=0;
  const fetcher=async(url,opts)=>{
    if(url.endsWith('/public/products'))return Response.json([{name:'Needles jacket',brand:'Needles',price:200}]);
    if(url.endsWith('/users/me'))return Response.json({data:{isPaying:false,plan:{monthlyBasePriceUsd:0,tier:'FREE',monthlyUsageCreditsUsd:5}}});
    if(url.endsWith('/users/me/limits'))return Response.json({data:{current:{monthlyUsageUsd:0},limits:{maxMonthlyUsageUsd:5}}});
    if(/\/(getMe|getChat)$/.test(url))return Response.json({ok:true,result:{}});
    if(url.includes('/ai/run/@cf/meta/llama-4-scout')){gpu++;assert.equal(JSON.parse(opts.body).max_tokens,400);return Response.json({success:true,result:{response:{garment_visible:false,brand_text:'',care_text:'',brand_photo:-1,care_photo:-1,contradiction:false,reason:'not_clothing'}}});}
    throw Error('unexpected outbound call');
  };
  const env={CLOUDFLARE_API_TOKEN:'fixture',APIFY_TOKEN:'fixture',TELEGRAM_BOT_TOKEN:'123:fixture',TELEGRAM_CHAT_ID:'42'};
  for(let i=0;i<2;i++){const result=await check(env,{query,fetcher,now,testPolicy});assert.equal(result.photoState,'ready');assert.equal(result.photoAttempts,1);assert.equal(result.newScraperStarts,0);assert.equal(result.messagesSent,0);assert(result.apifyReady&&result.telegramReady&&result.shopReferences);}
  assert.equal(gpu,1);assert.equal(db.prepare('SELECT attempts FROM radar_control').get().attempts,24);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM radar_alerts').get().n,0);
  assert.equal(db.prepare('SELECT attempts FROM radar_vision_daily').get().attempts,1);db.close();
});
