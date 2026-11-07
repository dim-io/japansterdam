import test from 'node:test';
import assert from 'node:assert/strict';
import {readCatalog} from './catalog.mjs';
const SHOP_CATALOG_URL='https://japansterdam-api.japansterdam-api.workers.dev/public/products';
test('separate account reads fresh public references without access to shop tables or hidden product fields',async()=>{
  const refs=await readCatalog({SHOP_CATALOG_URL,RADAR_DB:{prepare(){throw Error('no cross-account database access');}}},async()=>Response.json([{name:'Needles jacket',brand:'Needles',price:240,description:'not required'},{name:'Draft',brand:'Kapital',price:100,active:false}]));
  assert.deepEqual(refs,[{name:'Needles jacket',brand:'Needles',price:240}]);
});
test('unavailable or malformed public inventory stops assessment; no stale fallback',async()=>{
  for(const response of [new Response('',{status:503}),Response.json([]),Response.json([{name:'Invalid',brand:'Needles',price:null}])])await assert.rejects(readCatalog({SHOP_CATALOG_URL},async()=>response),/RADAR_INVENTORY_FAILED/);
  await assert.rejects(readCatalog({SHOP_CATALOG_URL:'https://untrusted.example'}),/RADAR_INVENTORY_FAILED/);
});
