import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const {cleanProduct}=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {cleanProduct};').toString('base64'));
const sizeSource=await readFile(new URL('../../js/sizing.js',import.meta.url),'utf8');
const {FIT_SIZES,suggestedFitsLike,productFitsLike,matchesFit}=await import('data:text/javascript;base64,'+Buffer.from(sizeSource).toString('base64'));
const {footwearSize,filterSizes}=await import('data:text/javascript;base64,'+Buffer.from(sizeSource).toString('base64'));
const input={name:'Archive jacket',brand:'orSlow',category:'Jackets & Outerwear',price:100,condition:'Very good',conditionNotes:'Light wear.',images:[]};
const clean=patch=>cleanProduct({...input,...patch},'jacket',123);
test('original Japanese label survives saving while multiple independently assigned filter sizes match',()=>{
 const saved=clean({size:'JP 4',fitsLike:['XL','L','L']});
 assert.equal(saved.size,'JP 4');assert.deepEqual(saved.fitsLike,['L','XL']);
 assert(matchesFit(saved,'L'));assert(matchesFit(saved,'XL'));assert(!matchesFit(saved,'M'));
 assert.deepEqual(productFitsLike(saved),['L','XL']);
});
test('frontend and backend infer only explicit international labels, never numeric or waist conversions',()=>{
 for(const label of ['M','L/XL','JP 4 (XL)','2XL','XXXL','One size','Free size','XXS','3','4','JP 5','W32','32/34','EU 48','']){
  assert.deepEqual(clean({size:label}).fitsLike,suggestedFitsLike(label),label);
 }
 for(const label of ['3','4','JP 5','W32','32/34','EU 48'])assert.deepEqual(suggestedFitsLike(label),[]);
 assert.deepEqual(productFitsLike({size:'M'}),['M']);
 assert.deepEqual(productFitsLike({size:'M',fitsLike:[]}),[]);
});
test('filter overrides can be cleared and invalid payloads cannot become new filter options',()=>{
 assert.deepEqual(clean({size:'XL',fitsLike:[]}).fitsLike,[]);
 for(const fitsLike of ['XL',null,{},['4'],['<script>'],[1],Array(10).fill('L')])assert.throws(()=>clean({size:'4',fitsLike}),/Fits like must/);
 assert.deepEqual(productFitsLike({size:'4',fitsLike:['4','XL','L','XL']}),['L','XL']);
 assert.equal(new Set(FIT_SIZES).size,FIT_SIZES.length);
});
test('fits-like filtering composes with category and brand, including ambiguous labels and sold garments',()=>{
 const products=[clean({size:'4',fitsLike:['L','XL']}),{...clean({size:'5',fitsLike:['XL']}),brand:'Needles',sold:true},clean({size:'M'}),clean({size:'4'})];
 assert.equal(products.filter(p=>matchesFit(p,'XL')).length,2);
 assert.equal(products.filter(p=>p.brand==='orSlow'&&matchesFit(p,'XL')).length,1);
 assert.equal(products.filter(p=>matchesFit(p,'')).length,4);
});
test('shoe filters use label systems without clothing fits or guessed international conversions',()=>{
 const shoes=[{category:'Footwear',size:'36',fitsLike:['M']},{category:'Footwear',size:'EU 36½'},{category:'Footwear',size:'UK 8 / EU 42'},{category:'Footwear',size:'US 9'},{category:'Footwear',size:'EU 37',active:false}];
 assert.equal(footwearSize('36'),'EU 36');assert.equal(footwearSize('EU 36,5'),'EU 36.5');
 assert.equal(footwearSize('UK 8'),'UK 8');assert.equal(footwearSize('JP 23'),'JP 23');
 assert.deepEqual(filterSizes(shoes,'Footwear'),['EU 36','EU 36.5','EU 42','US 9']);
 assert(matchesFit(shoes[0],'EU 36'));assert(!matchesFit(shoes[0],'M'));
 assert.deepEqual(productFitsLike(shoes[0]),[]);
 assert.deepEqual(filterSizes([...shoes,{category:'Tops',size:'M',fitsLike:['M']}],'Tops'),['M']);
});
