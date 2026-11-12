import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTrial} from './prepare-trial.mjs';
const now=Date.now(),testPolicy={id:'new',enabled:true,endsAt:new Date(now+86400000).toISOString()};
test('existing trials never spend a second readiness test or restart budgets',async()=>{
 assert.deepEqual(await prepareTrial({}, {query:async()=>[{id:'new'}],testPolicy,budget(){throw Error('must not run');},readiness(){throw Error('must not run');}}),{alreadyInitialized:true});
});
test('new trial requires the full free source reserve before any image inference',async()=>{
 let calls=0;
 for(const freePlanConfirmed of [false,true])await assert.rejects(prepareTrial({}, {now,testPolicy,query:async()=>[],budget:async()=>({freePlanConfirmed,enoughCredit:false}),readiness(){calls++;}}),new RegExp('free_source_budget_not_confirmed:'+(freePlanConfirmed?'insufficient_free_credit':'free_plan_unconfirmed')));
 assert.equal(calls,0);
});
test('successful preparation checks readiness without scraper or message side effects',async()=>{
 const result=await prepareTrial({}, {now,testPolicy,query:async()=>[],budget:async(token,fetcher,reserve)=>{assert.equal(reserve,1.69);return{freePlanConfirmed:true,enoughCredit:true};},readiness:async()=>({shopReferences:true,telegramReady:true,photoState:'ready'})});
 assert.deepEqual(result,{freeSourceBudgetConfirmed:true,photoState:'ready',newScraperStarts:0,messagesSent:0});
});


test('the bundle pilot reserves four extra bounded actor calls inside Free credit',async()=>{
 await prepareTrial({}, {now,testPolicy:{...testPolicy,bundleChecks:{enabled:true}},query:async()=>[],budget:async(token,fetcher,reserve)=>{assert.equal(reserve,1.81);return{freePlanConfirmed:true,enoughCredit:true};},readiness:async()=>({shopReferences:true,telegramReady:true,photoState:'ready'})});
});
