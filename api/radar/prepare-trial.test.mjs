import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTrial} from './prepare-trial.mjs';
const now=Date.now(),testPolicy={id:'new',enabled:true,endsAt:new Date(now+86400000).toISOString()};
test('existing trials never spend a second readiness test or restart budgets',async()=>{
 assert.deepEqual(await prepareTrial({}, {query:async()=>[{id:'new'}],testPolicy,budget(){throw Error('must not run');},readiness(){throw Error('must not run');}}),{alreadyInitialized:true});
});
test('new trial requires the full free source reserve before any image inference',async()=>{
 let calls=0;
 for(const freePlanConfirmed of [false,true])await assert.rejects(prepareTrial({}, {now,testPolicy,query:async()=>[],budget:async()=>({freePlanConfirmed,enoughCredit:false}),readiness(){calls++;}}),new RegExp('source_budget_not_confirmed:'+(freePlanConfirmed?'insufficient_included_credit':'plan_unconfirmed')));
 assert.equal(calls,0);
});
test('successful preparation checks readiness without scraper or message side effects',async()=>{
 const result=await prepareTrial({}, {now,testPolicy,query:async()=>[],budget:async(token,fetcher,reserve)=>{assert.equal(reserve,1.69);return{freePlanConfirmed:true,enoughCredit:true};},readiness:async()=>({shopReferences:true,telegramReady:true,workersAiFreePlan:true,photoState:'ready'})});
 assert.deepEqual(result,{includedSourceBudgetConfirmed:true,photoState:'ready',newScraperStarts:0,messagesSent:0});
});


test('the bundle pilot reserves four extra bounded actor calls inside Free credit',async()=>{
 await prepareTrial({}, {now,testPolicy:{...testPolicy,bundleChecks:{enabled:true}},query:async()=>[],budget:async(token,fetcher,reserve)=>{assert.equal(reserve,1.81);return{freePlanConfirmed:true,enoughCredit:true};},readiness:async()=>({shopReferences:true,telegramReady:true,workersAiFreePlan:true,photoState:'ready'})});
});

test('replacement monitor reuses only recent same-account photo proof and rechecks shop and Telegram',async()=>{
 const {validOwnerConfirmation}=await import('./free-plan.mjs');
 const {default:readinessPolicy}=await import('./owner-readiness.json',{with:{type:'json'}});
 const now=Date.now(),testPolicy={id:'replacement',enabled:true,sourceProvider:'topapi-monitor',mode:'fresh-rotation',endsAt:new Date(now+7200000).toISOString(),visionAccountConfirmation:{accountId:readinessPolicy.accountId,plan:'free',source:'dashboard_current_plan',confirmedAt:new Date(now-3600000).toISOString(),authorizedAt:new Date(now).toISOString(),validUntil:new Date(now+7200000).toISOString()}};
 assert(validOwnerConfirmation(testPolicy,now));let imageTests=0;
 const result=await prepareTrial({APIFY_TOKEN:'fixture',TELEGRAM_BOT_TOKEN:'123:fixture',TELEGRAM_CHAT_ID:'42'},{now,testPolicy,
  query:async(sql)=>sql.includes('radar_photo_checks')?[{state:'ready',created_at:now-3600000}]:[],
  fetcher:async url=>String(url).includes('workers.dev')?Response.json([{name:'Needles shirt',brand:'Needles',price:100}]):Response.json({ok:true,result:{}}),
  budget:async()=>({includedPlanConfirmed:true,enoughCredit:true}),readiness:async()=>{imageTests++;throw Error('no new image test');}});
 assert.equal(result.reusedPhotoReadiness,true);assert.equal(imageTests,0);assert.equal(result.messagesSent,0);
});
