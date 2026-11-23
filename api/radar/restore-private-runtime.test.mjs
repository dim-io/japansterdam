import test from 'node:test';
import assert from 'node:assert/strict';
import {restorePrivateRuntime} from './restore-private-runtime.mjs';
const account='a'.repeat(32),source='b'.repeat(32),database='00000000-0000-0000-0000-000000000002';
const files={
 'tools/deal-radar/config.json':JSON.stringify({authenticityReviews:{fixture:{verdict:'suspect'}}}),
 'tools/deal-radar/pilot-v4.json':JSON.stringify({sourceBudget:{maxMonthlyUsageUsd:19},visionAccountConfirmation:{accountId:account}}),
 'api/radar/owner-readiness.json':JSON.stringify({accountId:account}),
 'api/radar/account-migration.mjs':`export const SOURCE={account:'${source}',database:'${database}'};\nexport const TARGET={account:'${account}',database:'${database}'};`,
};
test('restoration retains owner bindings, private feedback and budget without guessing account identity',()=>{
 const r=restorePrivateRuntime(path=>files[path]);assert.equal(r.deployment.accountId,account);assert.equal(r.policy.sourceBudget.maxMonthlyUsageUsd,19);assert.equal(r.config.authenticityReviews.fixture.verdict,'suspect');
 assert.throws(()=>restorePrivateRuntime(path=>path==='api/radar/owner-readiness.json'?'{}':files[path]),/inconsistent/);
 assert.throws(()=>restorePrivateRuntime(path=>path==='api/radar/account-migration.mjs'?'':files[path]),/unavailable/);
});
