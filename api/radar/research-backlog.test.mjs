import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {reviewBacklog} from './research-backlog.mjs';
const now=Date.now();
const policy={id:'pilot-2026-11-06',enabled:true,researchEnabled:true,startsAt:new Date(now-3600000).toISOString(),endsAt:new Date(now+3600000).toISOString()};
const item=id=>({url:`https://www.vinted.nl/items/${id}-test`,title:'orSlow white denim jacket',brand:'orSlow',price:35,currency:'EUR',condition:'very_good',size:'XXS',available:true,observedAt:new Date(now-60000).toISOString(),photoUrls:['https://images1.vinted.net/a.png','https://images1.vinted.net/b.png'],comparables:[]});
function setup(ids){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0002_radar.sql','0003_radar_transport_retry.sql','0004_radar_vision.sql','0005_radar_second_trial.sql','0006_radar_research.sql','0007_radar_research_test.sql'])db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 for(const id of ids)db.prepare("INSERT INTO radar_research (pilot_id,item_id,data,priority,state,first_seen,last_seen) VALUES (?,?,?,4,'queued',?,?)").run(policy.id,id,JSON.stringify(item(id)),now-500000,now-500000);
 const query=async(sql,args=[])=>{const s=db.prepare(sql);return s.columns().length?s.all(...args):(s.run(...args),[]);};
 const messages=[];
 const env={APIFY_TOKEN:'fixture',TELEGRAM_BOT_TOKEN:'123:fixture',TELEGRAM_CHAT_ID:'42'};
 const fetcher=async(url,init)=>{assert(String(url).startsWith('https://api.telegram.org/'));messages.push(JSON.parse(init.body).text);return Response.json({ok:true,result:{message_id:messages.length}});};
 return{db,query,env,messages,fetcher};
}
test('backlog sends only recently available matching candidates, without AI or scraper starts, once',async()=>{
 const ctx=setup(['1','2','3','4','10594928216']);
 const options={query:ctx.query,now,clock:()=>now,fetcher:ctx.fetcher,testPolicy:policy,readExisting:async()=>[item('1'),{...item('2'),available:false},{...item('3'),observedAt:new Date(now-2*3600000).toISOString()},item('10594928216')]};
 const report=await reviewBacklog(ctx.env,options);
 assert.equal(report.waiting,5);assert.equal(report.revalidated,1);assert.equal(report.sent,1);assert.equal(report.excluded,1);assert.equal(report.unconfirmed,3);assert.equal(report.newScraperStarts,0);assert.equal(report.aiCalls,0);
 assert(ctx.messages[0].includes('Nog niet visueel gecontroleerd'));assert(ctx.messages[0].includes('XXS'));
 assert.equal(ctx.db.prepare("SELECT last_seen FROM radar_research WHERE item_id='2'").get().last_seen,now-500000);
 assert.deepEqual(await reviewBacklog(ctx.env,options),{state:'already_attempted'});assert.equal(ctx.messages.length,1);ctx.db.close();
});
test('a prior skipped notice may be delivered, but a previously sent or ambiguous notice cannot be repeated',async()=>{
 const ctx=setup(['1','2','3']);
 for(const [id,delivery] of [['1','skipped'],['2','sent'],['3','pending']])ctx.db.prepare('INSERT INTO radar_alerts (pilot_id,item_id,price,delivery,attempted_at) VALUES (?,?,?,?,?)').run(policy.id,'photo-review:'+id,35,delivery,now-1000);
 const report=await reviewBacklog(ctx.env,{query:ctx.query,now,clock:()=>now,fetcher:ctx.fetcher,testPolicy:policy,readExisting:async()=>[item('1'),item('2'),item('3')]});
 assert.equal(report.sent,1);assert.equal(ctx.messages.length,1);ctx.db.close();
});
test('failed source checks cannot deliver stale backlog items or auto retry; expired trials remain inert',async()=>{
 const ctx=setup(['1']);
 const options={query:ctx.query,now,clock:()=>now,testPolicy:policy,readExisting:async()=>{throw Error('private-provider-token');}};
 const report=await reviewBacklog(ctx.env,options);assert.equal(report.state,'incomplete');assert.equal(report.sent,0);assert(!JSON.stringify(report).includes('private-provider-token'));
 assert.deepEqual(await reviewBacklog(ctx.env,options),{state:'already_attempted'});
 assert.deepEqual(await reviewBacklog(ctx.env,{...options,now:now+7200000}),{state:'outside_trial'});ctx.db.close();
});
