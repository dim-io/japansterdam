import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureDomain} from './workers-domain.mjs';
test('existing Workers address is kept; denied access never triggers domain changes',async()=>{
  const calls=[];
  assert.equal(await ensureDomain('fixture',async(url,opts)=>{calls.push(opts);return Response.json({success:true,result:{subdomain:'existing'}});}), 'existing');
  assert.equal(calls.length,1);assert.equal(calls[0].method,undefined);
  await assert.rejects(ensureDomain('fixture',async()=>Response.json({success:false,errors:[{code:10000}]},{status:403})),/read_failed_http_403/);
});
test('only an explicitly absent address registers the owner-account default',async()=>{
  let calls=0;
  assert.equal(await ensureDomain('fixture',async(url,opts)=>{
    assert(url.includes('81a93f1ef55a892620ab77cf0f8163f6'));
    if(!calls++)return Response.json({success:false,errors:[{code:10007}]},{status:404});
    assert.equal(opts.method,'PUT');assert.equal(opts.body,'{"subdomain":"sam-jesse"}');
    return Response.json({success:true,result:{subdomain:'sam-jesse'}});
  }),'sam-jesse');assert.equal(calls,2);
});
