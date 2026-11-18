import test from 'node:test';
import assert from 'node:assert/strict';
import {monitorInput,monitorRow,monitorGroup,MONITOR_STORE,monitorStore} from './monitor-source.mjs';
import {freshIntake} from './intake.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import policy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
const observed='2026-11-16T20:00:00Z';
const row={record_type:'item',id:123,url:'https://www.vinted.nl/items/123-piece',title:'Needles Rebuild shirt',brand_title:'Needles',price_amount:65,price_currency:'EUR',condition:'Very good',size_title:'XS',uploaded_ago:'a minute ago',category_path:['Women','Clothing','Shirts'],availability:'InStock',can_buy:true,is_sold:false,is_hidden:false,is_reserved:false,photo_url:'https://images1.vinted.net/front.png',photos:['https://images1.vinted.net/label.png']};
test('persistent monitor seeds old inventory, never resets and applies per-brand prices and adult fashion filters',()=>{
 const input=monitorInput([['Needles','360271'],['Nanamica','596562'],['Ts(s)',{searchText:'Ts(s)'}]]);
 assert.equal(input.monitorStoreName,monitorStore(['Needles','Nanamica','Ts(s)']));assert(input.monitorStoreName.startsWith(MONITOR_STORE));assert.equal(monitorStore(['A','B']),monitorStore(['B','A']));assert.notEqual(monitorStore(['A','B']),monitorStore(['C','D']));assert.equal(input.skipFirstRun,true);assert.equal(input.resetMonitor,false);assert.equal(input.alertOnPriceDrop,false);assert.equal(input.maxItems,30);assert.equal(input.priceTo,70);assert.equal(monitorInput([['Nanamica','596562']]).priceTo,70);
 assert.deepEqual(input.catalogIds,['5','1904']);assert.equal(new URL(input.searchQueries[0]).searchParams.get('price_to'),'70');assert.equal(new URL(input.searchQueries[1]).searchParams.get('price_to'),'70');assert(!new URL(input.searchQueries[2]).searchParams.has('brand_ids[]'));
 assert.equal(new URL(input.searchQueries[1]).searchParams.get('brand_ids[]'),'596562');assert(!new URL(input.searchQueries[1]).searchParams.has('search_text'));assert.deepEqual(input.brands,[]);
 assert.throws(()=>monitorInput([['Unknown','1']]),/Unrecognized/);
});

test('recent snapshots deliver an initial sample without seeding away every result or increasing the run budget',async()=>{
 const selection=[['Needles','360271'],['Nanamica','596562'],['Ts(s)',{searchText:'Ts(s)'}]];
 const input=monitorInput(selection,{mode:'recent-snapshot'});
 assert.equal(policy.sourceMode,'recent-snapshot');assert.equal(input.monitorMode,false);assert.equal(input.skipFirstRun,false);assert.equal(input.resetMonitor,false);assert.equal(input.maxItems,30);assert.equal(input.maxItemsPerSearch,7);assert.equal(input.includeSellerDetails,false);assert.equal(input.includeSellerReviews,false);
 assert(input.maxItemsPerSearch*input.searchQueries.length<=input.maxItems);
 const porter=monitorInput([['Porter Yoshida',policy.brands['Porter Yoshida']]],{mode:'recent-snapshot'});
 assert(porter.includeKeywords.includes('Porter'));assert(porter.includeKeywords.includes('Yoshida Porter'));
 let starts=0;
 const results=await monitorGroup(selection,{mode:'recent-snapshot',token:'fixture',fetcher:async(url,options)=>{
  if(options.method==='POST'){starts++;assert.match(url,/maxTotalChargeUsd=0.015/);assert.match(url,/maxItems=30/);assert.equal(JSON.parse(options.body).skipFirstRun,false);return Response.json({data:{id:'Snapshot1',status:'SUCCEEDED',defaultDatasetId:'Data1',finishedAt:observed}});}
  if(options.method==='PUT')return Response.json({data:{}});
  return Response.json([row]);
 }});
 assert.equal(starts,1);assert.equal(results[0].items.length,1);assert.equal(results[0].freshness.state,'source_recent_snapshot');assert.equal(results[0].freshness.baseline,'none');
 assert.equal(freshIntake({...results[0].items[0],publishedAt:'2026-11-15T19:00:00Z'},config,Date.parse(observed)),'listing_not_recent');
 assert.throws(()=>monitorInput(selection,{mode:'unknown'}),/source mode/);
});
test('actual replacement schema preserves publication, photos and availability without inferring them',()=>{
 const item=monitorRow(row,observed);assert.equal(item.price,65);assert.equal(item.brand,'Needles');assert.equal(item.available,true);assert.equal(item.condition,'very_good');assert.equal(item.photoUrls.length,2);assert.equal(item.publishedAt,'2026-11-16T19:59:00.000Z');assert.equal(item.size,'XS');
 assert.equal(monitorRow({...row,is_reserved:true},observed).available,false);
 assert.equal(monitorRow({...row,availability:undefined,can_buy:undefined},observed).available,null);
 assert.equal(monitorRow({...row,brand_title:'Nanamica',title:'Nanamica jacket'},observed).price,65);
 assert.equal(monitorRow({...row,brand_title:'Nanamica',price_amount:70.01},observed),null);
 assert.equal(monitorRow({...row,record_type:'seller'},observed),null);
});
test('three searches share one capped actor run and only genuinely matching brands are returned',async()=>{
 let starts=0;
 const result=await monitorGroup([['Needles','360271'],['Nanamica','596562'],['Ts(s)',{searchText:'Ts(s)'}]],{token:'fixture',fetcher:async(url,o)=>{
  if(o.method==='POST'){starts++;assert(url.includes('maxItems=30'));assert(url.includes('maxTotalChargeUsd=0.015'));assert.equal(JSON.parse(o.body).monitorMode,true);return Response.json({data:{id:'Run1',status:'SUCCEEDED',defaultDatasetId:'Data1',finishedAt:observed}});}
  assert(url.includes('limit=30'));return Response.json([row,{...row,id:124,url:'https://www.vinted.nl/items/124-other',brand_title:'Nike'}]);
 }});
 assert.equal(starts,1);assert.equal(result[0].items.length,1);assert.equal(result[1].items.length,0);assert.equal(result[2].items.length,0);
});
