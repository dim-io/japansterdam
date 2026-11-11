import test from 'node:test';
import assert from 'node:assert/strict';
import {readWardrobe} from './wardrobe.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
const now=Date.now(),row={row_type:'item',seller_id:'42',link:'https://www.vinted.nl/items/123-test',title:'Needles blue velour jacket',brand:'Needles',price:65,currency:'EUR',condition:'Very good',photo_links:['https://images1.vinted.net/a.png']};
test('wardrobe calls are capped and return only active matching-seller items, never seller profiles or feedback',async()=>{
 let calls=0;
 const result=await readWardrobe('fixture',{id:'42'},config,{clock:()=>now,fetcher:async(url,opts)=>{
  calls++;assert(!url.includes('token='));assert.equal(opts.redirect,'manual');
  if(opts.method==='POST'){
   assert(url.includes('maxTotalChargeUsd=0.03'));assert(url.includes('maxItems=11'));
   assert.deepEqual(JSON.parse(opts.body),{sellers:['42'],includeItems:true,includeFeedback:false,maxItems:10,maxFeedback:0,language:'en'});
   return Response.json({data:{id:'run123',status:'SUCCEEDED',defaultDatasetId:'data123',finishedAt:new Date(now).toISOString()}});
  }
  return Response.json([row,{...row,row_type:'seller'},{...row,seller_id:'99'},{...row,price:71},{...row,link:'https://evil.test/items/123-test'},{...row,link:'https://www.vinted.nl/items/456-test',is_sold:true}]);
 }});
 assert.equal(calls,2);assert.equal(result.length,2);assert.equal(result[0].available,true);assert.equal(result[1].available,false);
 assert(result.every(item=>!Object.hasOwn(item,'seller_rating')));
});
test('incomplete runs are aborted after bounded polling and never automatically restarted',async()=>{
 let starts=0,polls=0,aborts=0;
 await assert.rejects(readWardrobe('fixture',{username:'example'},config,{fetcher:async(url,opts)=>{
  if(url.includes('/runs?'))starts++;
  else if(url.endsWith('/abort'))aborts++;
  else polls++;
  return Response.json({data:{id:'run123',status:'RUNNING'}});
 }}),/SOURCE_UNAVAILABLE/);
 assert.equal(starts,1);assert.equal(polls,3);assert.equal(aborts,1);
});
