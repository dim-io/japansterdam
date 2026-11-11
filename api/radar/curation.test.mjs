import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import {curation,modelNumbers,matchingCompanion,coherentLabelCodes} from './curation.mjs';
import {researchCandidate} from './research.mjs';
import {normalizeRow} from '../../tools/deal-radar/provider.mjs';
const now=Date.now();
const item={url:'https://www.vinted.nl/items/123-test',title:'Needles blue velour track pants',brand:'Needles',price:35,currency:'EUR',size:'XS',category:'Women',condition:'very_good',available:true,observedAt:new Date(now).toISOString(),photoUrls:['https://images1.vinted.net/a.png','https://images1.vinted.net/b.png'],sellerRef:{id:'42',username:'example'}};
test('standalone Needles track pants cannot trigger research even at a very low price; other garments take priority',()=>{
 assert.equal(researchCandidate(item,config,now),null);
 assert(researchCandidate(item,config,now,{forBundle:true}));
 assert(curation(item,config).bundleWorthChecking);
 assert(!curation({...item,title:'Needles track pants black'},config).bundleWorthChecking);
 assert(researchCandidate({...item,title:'Needles Rebuild patchwork jacket'},config,now));
 assert.equal(researchCandidate({...item,title:'Needles blue velour track pants replica'},config,now,{forBundle:true}),null);
});
test('negative feedback is specific to the rejected listings; age, small size and womens category do not exclude',()=>{
 for(const id of ['10720361203','10720892142','10718287439','10722206945'])assert(!curation({...item,url:`https://www.vinted.nl/items/${id}-test`},config).allowed);
 assert(researchCandidate({...item,brand:'Engineered Garments',title:'Engineered Garments archive jacket 1999'},config,now));
 assert(researchCandidate({...item,brand:'Kapital',title:'Kapital bandana shirt'},config,now));
});
test('seller references retain only public identifiers and reject malformed input',()=>{
 const raw={link:item.url,title:item.title,brand:'Needles',price:35,currency:'EUR',seller_id:'42',seller_username:'example',seller_city:'private',seller_rating:5};
 const normalized=normalizeRow(raw,new Date(now).toISOString());
 assert.deepEqual(normalized.sellerRef,{id:'42',username:'example'});assert(!JSON.stringify(normalized).includes('private'));
 assert.equal(normalizeRow({...raw,seller_id:'http://evil',seller_username:'token?=secret'},'').sellerRef,null);
});
test('a possible set needs complementary garments, same brand, material and colour, never just a shared code',()=>{
 const top={...item,url:'https://www.vinted.nl/items/456-top',title:'Needles blue velour track jacket'};
 assert(matchingCompanion(item,top,config));
 for(const patch of [{brand:'Kapital'},{title:'Needles blue cotton shirt'},{title:'Needles red velour track jacket'},{title:'Needles blue velour track pants'},{url:item.url}])assert(!matchingCompanion(item,{...top,...patch},config));
 const screen=careText=>({state:'visually_consistent',careText});
 assert(coherentLabelCodes(screen('MR138 100% polyester'),screen('MR141 made in Japan')));
 assert(!coherentLabelCodes(screen('RN12345'),screen('RN12345')));
 assert(!coherentLabelCodes(screen('MR138'),{state:'inconclusive',careText:'MR141'}));
 assert.deepEqual(modelNumbers('model MR-138 / CA12345'),['MR138']);
});
