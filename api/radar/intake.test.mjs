import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationTime,freshIntake} from './intake.mjs';
import {scanSelection} from './worker.mjs';
import {normalizeRow} from '../../tools/deal-radar/provider.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import policy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
const now=Date.parse('2026-11-16T18:00:00Z'),observedAt=new Date(now).toISOString();
const good={title:'Needles Rebuild patchwork shirt',brand:'Needles',publishedAt:new Date(now-600000).toISOString()};
test('only source upload age establishes recency; missing and ambiguous dates stay unknown',()=>{
 assert.equal(publicationTime({uploaded_ago:'26 minutes ago'},observedAt),new Date(now-26*60000).toISOString());
 assert.equal(publicationTime({uploaded_ago:'Uploaded 2 hours ago'},observedAt),new Date(now-7200000).toISOString());
 assert.equal(publicationTime({uploaded_ago:'1 day ago'},observedAt),new Date(now-86400000).toISOString());
 assert.equal(publicationTime({uploaded_ago:'recently'},observedAt),undefined);
 assert.equal(publicationTime({},observedAt),undefined);
 const row=normalizeRow({link:'https://www.vinted.nl/items/123-test',title:good.title,brand:'Needles',price:20,currency:'EUR',uploaded_ago:'26 minutes ago',category_path:'Men > Shirts'},observedAt);
 assert.equal(row.publishedAt,new Date(now-26*60000).toISOString());assert.equal(row.category,'Men > Shirts');
});
test('brand-tagged non-clothing and missing/old timestamps never enter the photo queue',()=>{
 assert.equal(freshIntake(good,config,now),null);
 for(const title of ['Needles sewing pattern shirt','Needles jacket magazine','Kapital book jacket','Needles t-shirt mug','Needles poster'])assert.equal(freshIntake({...good,title},config,now),'not_clothing');
 assert.equal(freshIntake({...good,category:'Home > Toys'},config,now),'not_clothing');
 assert.equal(freshIntake({...good,title:'Plain work jacket'},config,now),'brand_claim_unsupported');
 assert.equal(freshIntake({...good,publishedAt:undefined},config,now),'upload_time_unknown');
 assert.equal(freshIntake({...good,publishedAt:new Date(now-7*3600000).toISOString()},config,now),'listing_not_recent');
 assert.equal(freshIntake({...good,publishedAt:new Date(now+3600000).toISOString()},config,now),'listing_not_recent');
 // Neither a small size nor a women's fashion category is a rejection.
 assert.equal(freshIntake({...good,size:'XS',category:'Women > Shirts'},config,now),null);
});
test('fresh trial covers all 34 canonical brands each hour within an unchanged monthly ceiling',()=>{
 const selections=Array.from({length:12},(_,slot)=>scanSelection(policy,slot));
 assert.equal(new Set(selections.flat().map(([b])=>b)).size,34);
 assert(selections.every(g=>g.length>=2&&g.length<=3));
 assert.deepEqual(scanSelection(policy,12),scanSelection(policy,0));
 assert.equal(policy.sourceBudget.maxMonthlyUsageUsd,19);
 assert.equal(Date.parse(policy.endsAt)-Date.parse(policy.startsAt),24*3600000);
 assert.equal(policy.requireVisualBrandEvidence,true);
});

test('French and Spanish garment titles do not disappear solely because of their language',()=>{
 for(const title of ['Maison Kitsuné pull bleu','Engineered Garments chaqueta','Evisu vaqueros','Evisu camiseta'])assert.equal(freshIntake({...good,title,brand:title.split(' ')[0]==='Maison'?'Maison Kitsuné':title.startsWith('Evisu')?'Evisu':'Engineered Garments'},config,now),null);
});
