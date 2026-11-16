import test from 'node:test';
import assert from 'node:assert/strict';
import {scanLimit,sourceReserve} from './trial-limits.mjs';
import {inWindow} from './worker.mjs';
test('day trial can reserve 288 monitor polls only with the tighter per-run cap and a 24-hour window',()=>{
 const now=Date.now(),p={enabled:true,sourceProvider:'topapi-monitor',mode:'fresh-rotation',maxCostPerMonitorRunUsd:.015,maxAttempts:288,startsAt:new Date(now).toISOString(),endsAt:new Date(now+86400000).toISOString()};
 assert.equal(scanLimit(p),288);assert.equal(sourceReserve(p),4.32);assert.equal(inWindow(now,p),true);
 for(const q of [{...p,maxCostPerMonitorRunUsd:.09},{...p,sourceProvider:'legacy'},{...p,maxAttempts:289},{...p,endsAt:new Date(now+86400001).toISOString()}])assert.equal(inWindow(now,q),false);
});
