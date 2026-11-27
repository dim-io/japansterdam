import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import policy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
import {selectionRejection} from '../../tools/deal-radar/selection.mjs';
import {monitorInput,monitorRow} from './monitor-source.mjs';
import {reviewItem} from './review-results.mjs';
import {freshIntake} from './intake.mjs';

const observedAt='2026-11-27T21:00:00Z';
const source={url:'https://www.vinted.nl/items/10992856968-goldwin',brand_title:'Goldwin',
 title:'Pantaloni sci Goldwin caldissimi',price_amount:24,price_currency:'EUR',
 condition:'Good',category_path:['Women','Clothing','Activewear','Trousers'],
 photo_url:'https://images1.vinted.net/photo.jpg',availability:'InStock',uploaded_ago:'a minute ago'};

test('Goldwin ski exclusion covers live intake and previously stored backend results',()=>{
 assert.equal(monitorRow(source,observedAt),null);
 assert.equal(reviewItem(source,{id:'Run1',finishedAt:observedAt}),null);
 assert.equal(freshIntake({url:source.url,brand:'Goldwin',title:source.title,category:'Women / Activewear',price:24,currency:'EUR',condition:'good',available:true,publishedAt:observedAt,observedAt},config,Date.parse(observedAt)),'goldwin_skiwear');
});

test('Goldwin ski clothing is rejected in multilingual titles, descriptions and source categories',()=>{
 for(const title of ['Goldwin ski jacket','Goldwin skibroek','Goldwin Skihose','Goldwin pantalon de ski','Goldwin pantaloni da sci','Goldwin chaqueta de esquí','Goldwin spodnie narciarskie','Goldwin snowboard pants','Goldwin skidjacka','Goldwin snow sports suit']){
  assert.equal(selectionRejection({brand:'Goldwin',title},config),'goldwin_skiwear',title);
 }
 for(const patch of [{category:'Men / Activewear / Ski & snowboard jackets'},{description:'Insulated jacket for skiing.'}]){
  assert.equal(selectionRejection({brand:'Goldwin',title:'Goldwin jacket',...patch},config),'goldwin_skiwear');
 }
 const privateOverride={...config,selectionProfiles:{...config.selectionProfiles,Goldwin:{allowedTypes:['trousers']}}};
 assert.equal(selectionRejection({brand:'Goldwin',title:source.title},privateOverride),'goldwin_skiwear');
});

test('technical Goldwin lifestyle pieces stay eligible without excluding other brands',()=>{
 for(const title of ['Goldwin 0 GORE-TEX shell jacket','Goldwin Zero down parka','Goldwin wool trousers','Goldwin technical fleece jacket','Goldwin ripstop cargo pants']){
  assert.equal(selectionRejection({brand:'Goldwin',title},config),null,title);
 }
 assert.equal(selectionRejection({brand:'Snow Peak',title:'Snow Peak ski jacket'},config),null);
});

test('Comoli is already in the live rotation, has a real search query and admits its Japanese clothing',()=>{
 const group=policy.brandGroups.find(names=>names.includes('Comoli'));
 assert(group);
 const input=monitorInput(group.map(brand=>[brand,policy.brands[brand]]));
 assert(input.searchQueries.some(url=>new URL(url).searchParams.get('search_text')==='Comoli'));
 for(const brand of ['COMOLI','Other']){
  const row={...source,brand_title:brand,title:'COMOLI cotton shirt',category_path:['Men','Clothing','Shirts']};
  assert.equal(monitorRow(row,observedAt)?.brand,'Comoli');
 }
});
