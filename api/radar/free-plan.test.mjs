import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_ID,freePlanDecision,validOwnerConfirmation } from './free-plan.mjs';
const now=Date.now(),end=new Date(now+3600000).toISOString();
const policy={endsAt:end,visionAccountConfirmation:{accountId:ACCOUNT_ID,plan:'free',source:'owner_confirmation',confirmedAt:new Date(now-1000).toISOString(),validUntil:end}};
test('an explicit current-trial owner confirmation can resolve unavailable plan reads without granting billing access',()=>{
 assert.equal(freePlanDecision({status:403},policy,now).allowed,true);
 assert.equal(freePlanDecision({status:403},{endsAt:end},now).allowed,false);
 assert.equal(validOwnerConfirmation(policy,now+7200000),false);
 assert.equal(validOwnerConfirmation({...policy,endsAt:new Date(now+7200000).toISOString()},now),false);
 assert.equal(validOwnerConfirmation({...policy,visionAccountConfirmation:{...policy.visionAccountConfirmation,accountId:'other'}},now),false);
});
test('a detected paid Workers plan overrides an owner confirmation',()=>{
 assert.equal(freePlanDecision({ok:true,data:{success:true,result:[{rate_plan:{id:'WORKERS_PAID'}}]}},policy,now).allowed,false);
 assert.equal(freePlanDecision({ok:true,data:{success:true,result:[]}},null,now).allowed,true);
});
