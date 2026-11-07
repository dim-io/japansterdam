import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRound} from './initial-round.mjs';
import {ACCOUNT_ID} from './free-plan.mjs';
const now=Date.now(),testPolicy={enabled:true,id:'fixture',mode:'rotating-brands',startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+86399000).toISOString(),maxAttempts:24,visionAccountConfirmation:{accountId:ACCOUNT_ID,plan:'free',source:'dashboard_current_plan',confirmedAt:new Date(now-1000).toISOString(),validUntil:new Date(now+86399000).toISOString()}};
test('first-round handoff skips prior attempts and times outside the first hour before external work',async()=>{
 const run=()=>{throw Error('must not run');};
 assert.equal((await initialRound({}, {now,testPolicy,query:async()=>[{attempts:1}],run})).initialRound,'already_started');
 assert.equal((await initialRound({}, {now:now+3600000,testPolicy,query:()=>{throw Error('must not read');},run})).initialRound,'outside_first_hour');
});
test('initial handoff uses the shared scanner and exposes only aggregate fields',async()=>{
 let calls=0;
 const result=await initialRound({}, {now,testPolicy,query:async()=>[{attempts:0}],run:async(env,options)=>{calls++;assert.equal(options.policy.id,testPolicy.id);assert(env.RADAR_DB&&env.AI);return {checked:20,sent:0,decisions:[{title:'private-item'}]};}});
 assert.equal(calls,1);assert.equal(result.checked,20);assert(!JSON.stringify(result).includes('private-item'));
});
