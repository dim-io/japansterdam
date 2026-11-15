import test from 'node:test';
import assert from 'node:assert/strict';
import api from '../src/index.js';
test('uploaded images support HEAD without returning an image body',async()=>{
 const env={IMAGES:{getWithMetadata:async()=>({value:new Uint8Array([1,2,3]),metadata:{contentType:'image/jpeg'}})}};
 for(const method of ['GET','HEAD']){
  const r=await api.fetch(new Request('https://japansterdam-api.example/img/products/image.jpg',{method}),env,{});
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'image/jpeg');assert.equal((await r.arrayBuffer()).byteLength,method==='HEAD'?0:3);
 }
});
