import test from 'node:test';
import assert from 'node:assert/strict';
import {privateConfigBindings,readPrivateConfig} from './private-config-bindings.mjs';
import {privateRuntime} from './private-runtime.mjs';
import {identifyBrand} from '../../tools/deal-radar/scoring.mjs';
import config from '../../tools/deal-radar/config.json' with{type:'json'};
test('large private configuration round-trips within Cloudflare per-binding limits with Unicode intact',()=>{
 const value={feedback:'日本語 — é 🧵'.repeat(1300)};
 const bindings=privateConfigBindings(JSON.stringify(value));
 assert(Number(bindings.RADAR_PRIVATE_CONFIG_PARTS)>1);
 for(const part of Object.values(bindings))assert(Buffer.byteLength(part)<5120);
 assert.deepEqual(JSON.parse(readPrivateConfig(bindings)),value);
 const shorter=privateConfigBindings('{"ok":true}');assert.deepEqual(JSON.parse(readPrivateConfig({...bindings,...shorter})),{ok:true});
 assert.throws(()=>readPrivateConfig({...bindings,RADAR_PRIVATE_CONFIG_2:undefined}));
 assert.throws(()=>readPrivateConfig({...bindings,RADAR_PRIVATE_CONFIG_PARTS:'99'}));
 assert.deepEqual(privateRuntime({...privateConfigBindings(JSON.stringify({config:{note:value.feedback},deployment:{accountId:'fixture'},policy:{id:'pilot-fixture',startsAt:'2026-11-20T00:00:00Z',sourceBudget:{maxMonthlyUsageUsd:19},visionAccountConfirmation:{accountId:'fixture'}}}))}).config.note,value.feedback);
});
test('The Real McCoys spelling variants map to one canonical Japanese label',()=>{
 for(const name of ["The Real McCoy's",'The Real McCoys','The Real McCoy’s','Real McCoy'])assert.equal(identifyBrand(name,config),"The Real McCoy's");
});
