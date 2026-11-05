import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { assess, authenticityAssessment } from './scoring.mjs';
import { estimateFromShop, matchingModelFeatures } from './valuation.mjs';
import { normalizeRow } from './provider.mjs';
import { fixtureReviews, photoFixture } from './auth-fixture.mjs';
const config=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
const now=Date.now();
const item={url:'https://www.vinted.nl/items/123456-fixture',brand:'Kapital',title:'Kapital Kountry Bandana Patchwork Jacket',price:10,currency:'EUR',available:true,condition:'new_with_tags',observedAt:new Date(now).toISOString(),photoUrls:photoFixture};
test('unreviewed high-risk brands cannot gain a score from a cheap price, claimed authenticity or photos',()=>{
  for(const extra of [{},{authenticity:'verified'},{authenticityReview:{verdict:'supported'}}]){
    const deal=assess({...item,...extra},config,now);
    assert.equal(deal.eligible,false);assert.equal(deal.score,undefined);assert.equal(deal.authenticity.state,'unreviewed');
  }
});
test('trusted review binds the actual listing photos and identity and expires',()=>{
  const cfg={...config,authenticityReviews:fixtureReviews(item,now)};
  assert(authenticityAssessment(item,cfg,now).allowed);
  for(const change of [{photoUrls:[]},{title:'Another jacket'},{photoUrls:[...photoFixture,'https://images1.vinted.net/changed.webp']}])assert(!authenticityAssessment({...item,...change},cfg,now).allowed);
  assert(!authenticityAssessment(item,cfg,now+8*86400000).allowed);
  const review=Object.values(cfg.authenticityReviews)[0];review.evidence=review.evidence.filter(x=>x.view!=='care_label');
  assert(!authenticityAssessment(item,cfg,now).allowed);
});
test('reported false positive is rejected and generic workwear never inherits bandana archive prices',()=>{
  const bad={...item,url:'https://www.vinted.nl/items/1069814625-veste-de-travail',title:'Veste de travail'};
  assert.equal(assess(bad,config,now).authenticity.state,'brand_mismatch');
  const products=[{brand:'Kapital',name:'KAPITAL Reversible Kountry Bandana Patchwork 1st Jacket',price:360}];
  assert.equal(estimateFromShop(bad,products,config),null);
  assert.equal(matchingModelFeatures('Work jacket','Reversible Kountry Bandana Patchwork 1st Jacket'),false);
  assert(estimateFromShop(item,products,config));
});
test('photo normalization preserves only supported public image links; URLs never count as an authenticity check',()=>{
  const row={link:item.url,title:item.title,brand:item.brand,price:10,currency:'EUR',availability:'available',condition:'Very good',image:photoFixture[0],photos:[{url:photoFixture[1]},'http://images1.vinted.net/no.webp','https://evil.invalid/a','https://token@images1.vinted.net/a']};
  const normalized=normalizeRow(row,new Date(now).toISOString());
  assert.deepEqual(normalized.photoUrls,photoFixture);
  assert.equal(authenticityAssessment(normalized,config,now).state,'unreviewed');
});
