import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {continuousPolicy,initializeContinuousDay} from './continuous.mjs';
import {privateRuntime} from './private-runtime.mjs';
import {inWindow,scanSelection} from './worker.mjs';
import {sourceReserve} from './trial-limits.mjs';
import {monitorInput} from './monitor-source.mjs';
import {identifyBrand} from '../../tools/deal-radar/scoring.mjs';
import {validOwnerConfirmation} from './free-plan.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
const now=Date.parse('2026-11-24T13:00:00Z');
const old={enabled:true,id:'pilot-2026-11-20',startsAt:'2026-11-20T22:00:00Z',endsAt:'2026-11-21T22:00:00Z',maxAttempts:288,sourceBudget:{maxMonthlyUsageUsd:19},visionAccountConfirmation:{accountId:'fixture',plan:'free',source:'owner_confirmation',confirmedAt:'2026-11-20T22:00:00Z',validUntil:'2026-11-21T22:00:00Z'}};
const operation={enabled:true,mode:'continuous',authorizedAt:'2026-11-23T00:00:00Z',dailyScanLimit:288};
test('continuous private runtime replaces expired trial windows and stale brand lists without raising budgets',()=>{
 const env={RADAR_PRIVATE_CONFIG:JSON.stringify({policy:{...old,brands:{Needles:'360271'},brandGroups:[['Needles']]},deployment:{accountId:'fixture'},config:{maxItemPrice:100,researchBrands:["Needles"],aliases:{Needles:["Private fixture alias"]}}})};
 const p=privateRuntime(env,now).policy,next=privateRuntime(env,now+86400000).policy;
 assert(inWindow(now,p));assert(inWindow(now+86400000,next));assert.notEqual(p.id,next.id);assert(!inWindow(now+86400000,p));
 assert(privateRuntime(env,now).config.researchBrands.includes('Hender Scheme'));
 assert(privateRuntime(env,now).config.aliases.Needles.includes('Private fixture alias'));
 assert.equal(p.maxAttempts,288);assert.equal(p.sourceBudget.maxMonthlyUsageUsd,19);assert.equal(sourceReserve(p),.31);
 assert.equal(Object.keys(p.brands).length,52);assert.equal(p.brandGroups.length,18);assert.equal(p.continuous.historyStartsAt,old.startsAt);
 for(let i=0;i<18;i++)assert(monitorInput(scanSelection(p,i)).searchQueries.length<=9);
 assert.equal(privateRuntime().policy.enabled,false); // Public fixtures cannot enable production.
 // Continuous operation does not extend a stale Free-account attestation.
 assert.equal(validOwnerConfirmation(p,now),false);
});
test('daily initialization preserves counters, previous research and deduplication history across repeated deploys',async()=>{
 const db=new DatabaseSync(':memory:');
 for(const name of ['0002_radar.sql','0003_radar_transport_retry.sql','0006_radar_research.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.prepare('INSERT INTO radar_control (id,attempts) VALUES (?,288)').run(old.id);
 db.prepare('INSERT INTO radar_seen VALUES (?,?,?,?)').run(old.id,'42',30,now-86400000);
 db.prepare("INSERT INTO radar_research (pilot_id,item_id,data,priority,state,first_seen,last_seen) VALUES (?,?,?,7,'notified',?,?)").run(old.id,'42','{}',now-86400000,now-86400000);
 const query=async(q,args=[])=>{const s=db.prepare(q);return s.columns().length?s.all(...args):(s.run(...args),[]);};
 const p=continuousPolicy(old,operation,now);await initializeContinuousDay(query,p);
 db.prepare('UPDATE radar_control SET attempts=288 WHERE id=?').run(p.id);
 await initializeContinuousDay(query,p);
 assert.equal(db.prepare('SELECT attempts FROM radar_control WHERE id=?').get(p.id).attempts,288);
 const tomorrow=continuousPolicy(old,operation,now+86400000);await initializeContinuousDay(query,tomorrow);
 assert.equal(db.prepare('SELECT attempts FROM radar_control WHERE id=?').get(tomorrow.id).attempts,0);
 assert.equal(db.prepare('SELECT state FROM radar_research WHERE pilot_id=?').get(tomorrow.id).state,'notified');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM radar_seen').get().n,1);
 assert.equal(db.prepare('SELECT attempts FROM radar_control WHERE id=?').get(old.id).attempts,288);db.close();
});
test('continuous mode requires explicit authorization and the daily limit stays bounded',()=>{
 assert.equal(continuousPolicy(old,{enabled:false},now),old);
 assert.throws(()=>continuousPolicy(old,{...operation,dailyScanLimit:1000},now));
 assert.throws(()=>continuousPolicy(old,operation,Date.parse('2026-11-22T00:00:00Z')));
});
test('Rocky Mountain Featherbed uses exact full-brand queries and does not accept generic Rocky Mountain',()=>{
 assert.equal(identifyBrand('Rocky Mountain Feather Bed',config),'Rocky Mountain Featherbed');
 assert.equal(identifyBrand('Rocky Mountain bicycles',config),null);
 assert.equal(identifyBrand('Rocky Mountain outdoor jacket',config),null);
 const p=privateRuntime({RADAR_PRIVATE_CONFIG:JSON.stringify({policy:old,deployment:{accountId:'fixture'}})},now).policy;
 const input=monitorInput([['Rocky Mountain Featherbed',p.brands['Rocky Mountain Featherbed']]]);
 assert.deepEqual(input.searchQueries.map(q=>new URL(q).searchParams.get('search_text')),['Rocky Mountain Featherbed','Rocky Mountain Feather Bed']);
});
