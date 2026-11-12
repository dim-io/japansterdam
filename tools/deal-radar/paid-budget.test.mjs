import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetDecision,preflight} from './budget.mjs';
const user={data:{isPaying:true,plan:{tier:'STARTER',monthlyBasePriceUsd:19,monthlyUsageCreditsUsd:19}}};
const limits={data:{current:{monthlyUsageUsd:5},limits:{maxMonthlyUsageUsd:100}}};
const policy={allowPaidIncludedCredits:true,maxMonthlyUsageUsd:19};
test('Starter requires explicit authorization and never pretends to be Free',()=>{
 assert.equal(budgetDecision(user,limits,1.81).enoughCredit,false);
 const out=budgetDecision(user,limits,1.81,policy);assert.equal(out.freePlanConfirmed,false);assert.equal(out.includedPlanConfirmed,true);assert.equal(out.enoughCredit,true);
});
test('included credit and local ceiling block overages despite a larger account limit',()=>{
 const used=n=>({data:{...limits.data,current:{monthlyUsageUsd:n}}});
 assert.equal(budgetDecision(user,used(18.8),.31,policy).enoughCredit,false);
 assert.equal(budgetDecision({...user,data:{...user.data,plan:{...user.data.plan,monthlyUsageCreditsUsd:6}}},limits,1.81,policy).enoughCredit,false);
 for(const p of [{...policy,maxMonthlyUsageUsd:20},{...policy,maxMonthlyUsageUsd:NaN},{...policy,allowPaidIncludedCredits:false}])assert.equal(budgetDecision(user,limits,.31,p).enoughCredit,false);
});
test('preflight passes the authorized policy to the private account decision',async()=>{
 const result=await preflight('fixture',async url=>Response.json(url.endsWith('/users/me')?user:limits),1.81,policy);
 assert.equal(result.enoughCredit,true);
});
