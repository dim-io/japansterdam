import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationTime,publicationDetails,freshIntake} from './intake.mjs';
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
test('exact Unix strings take precedence over rounded ages and malformed/future dates stay untrusted',()=>{
 const exact=now-90000;
 for(const value of [exact,exact/1000,String(exact),String(exact/1000)]){
  const details=publicationDetails({created_at_ts:value,uploaded_ago:'2 hours ago'},observedAt);
  assert.equal(details.at,new Date(exact).toISOString());assert.equal(details.kind,'exact');
 }
 for(const value of ['0','123',1e100,'2999-01-01T00:00:00Z'])assert.equal(publicationDetails({created_at_ts:value},observedAt),null);
 assert.equal(publicationDetails({uploaded_ago:'2 minutes ago'},'not a date'),null);
});
test('relative ages use the row capture time and report their real precision, including months and years',()=>{
 const scraped='2026-11-16T17:59:30Z';
 const details=publicationDetails({scraped_at:scraped,uploaded_ago:'2 hours ago'},observedAt);
 assert.equal(details.at,'2026-11-16T15:59:30.000Z');assert.equal(details.kind,'estimated');assert.equal(details.precision,'hour');
 assert.equal(publicationDetails({uploaded_ago:'a month ago'},observedAt).at,'2026-10-16T18:00:00.000Z');
 assert.equal(publicationDetails({uploaded_ago:'2 years ago'},observedAt).precision,'year');
 assert.equal(publicationDetails({uploaded_ago:'a month ago'},'2026-03-31T12:00:00Z').at,'2026-02-28T12:00:00.000Z');
 assert.equal(publicationDetails({uploaded_ago:'just now'},observedAt).kind,'estimated');
 assert.equal(publicationDetails({uploaded_ago:'30 seconds ago'},observedAt).precision,'minute');
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
test('fresh trial covers all selected canonical brands each cycle within an unchanged monthly ceiling',()=>{
 const selections=Array.from({length:policy.brandGroups.length},(_,slot)=>scanSelection(policy,slot));
 assert.equal(new Set(selections.flat().map(([b])=>b)).size,51);
 assert(selections.every(g=>g.length>=2&&g.length<=3));
 assert.deepEqual(scanSelection(policy,policy.brandGroups.length),scanSelection(policy,0));
 assert.equal(policy.requireVisualBrandEvidence,true);
 assert.equal(policy.enabled,false);assert.equal('sourceBudget' in policy,false);
});

test('French and Spanish garment titles do not disappear solely because of their language',()=>{
 for(const title of ['Maison Kitsuné pull bleu','Engineered Garments chaqueta','Evisu vaqueros','Evisu camiseta'])assert.equal(freshIntake({...good,title,brand:title.split(' ')[0]==='Maison'?'Maison Kitsuné':title.startsWith('Evisu')?'Evisu':'Engineered Garments'},config,now),null);
});
