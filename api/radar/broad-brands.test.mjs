import test from 'node:test';
import assert from 'node:assert/strict';
import {scanSelection} from './worker.mjs';
import {probe} from '../../tools/deal-radar/provider.mjs';
import {identifyBrand,itemPriceLimit} from '../../tools/deal-radar/scoring.mjs';
import {researchCandidate} from './research.mjs';
import {curation} from './curation.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import policy from '../../tools/deal-radar/pilot-v3.json' with {type:'json'};

test('broad rotation covers every selected brand without increasing the daily source budget',()=>{
 const counts=new Map();
 for(let slot=0;slot<24;slot++){
  const selection=scanSelection(policy,slot);
  assert.equal(selection.length,2);
  for(const [brand] of selection){assert.equal(identifyBrand(brand,config),brand);counts.set(brand,(counts.get(brand)||0)+1);assert.equal(itemPriceLimit(brand,config),['Needles','Kapital'].includes(brand)?70:40);}
 }
 assert.equal(counts.size,20);assert.equal([...counts.values()].reduce((a,b)=>a+b),48);
 assert([...counts.values()].every(n=>n===2||n===3));
 assert.throws(()=>scanSelection({...policy,brandGroups:[...policy.brandGroups,policy.brandGroups[0]]},0),/merkschema/);
});
test('keyword search removes the default Needles filter, retains bounds, and never infers the returned brand',async()=>{
 let input;
 const result=await probe({token:'fixture',searchText:'BEAMS Plus',maxResults:10,maxCostUsd:.03,maxPrice:40,fetcher:async(url,opts)=>{
  if(opts.method==='POST'){
   input=JSON.parse(opts.body);assert(!('brandIds' in input));
   const u=new URL(input.searchQueries[0]);assert.equal(u.searchParams.get('search_text'),'BEAMS Plus');assert(!u.searchParams.has('brand_ids[]'));assert.equal(u.searchParams.get('price_to'),'40');assert.equal(u.searchParams.get('order'),'newest_first');
   assert(url.includes('maxItems=10'));assert(url.includes('maxTotalChargeUsd=0.03'));
   return Response.json({data:{id:'run123',status:'SUCCEEDED',defaultDatasetId:'data123'}});
  }
  return Response.json([{link:'https://www.vinted.nl/items/123-example',brand:'Other',title:'BEAMS Plus style',price:20,currency:'EUR'}]);
 }});
 assert.equal(result.items[0].brand,'Other');assert.notEqual(identifyBrand(result.items[0].brand,config),identifyBrand('BEAMS Plus',config));
});
test('all five rejected tips stay excluded without banning their garment categories',()=>{
 for(const id of ['10738630152','10760858891','10763768360','10780398934','10780529953'])assert(!curation({url:`https://www.vinted.nl/items/${id}-piece`,brand:'Needles',title:'jacket'},config).allowed);
 assert(curation({url:'https://www.vinted.nl/items/999-other',brand:'Needles',title:'jacket'},config).allowed);
});

test('new peripheral brands can generate research tips without a resale comparable',()=>{
 for(const brand of ['Nanamica','Kaptain Sunshine','South2 West8','Haversack','Blue Blue Japan','WTAPS']) {
  const candidate=researchCandidate({url:'https://www.vinted.nl/items/999-piece',brand,title:brand+' jacket',price:25,currency:'EUR',available:true,condition:'very_good',observedAt:new Date().toISOString(),photoUrls:['https://images1.vinted.net/a.png','https://images1.vinted.net/b.png'],comparables:[]},config);
  assert(candidate,brand+' should reach research');
 }
});
