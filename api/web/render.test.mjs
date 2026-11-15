import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import worker from './worker.mjs';
import { productMeta,productSchema,productHTML,brandCards,jsonScript,publishedDescription } from './render.mjs';
const piece={slug:'legacy',name:'Needles Archive Shirt',brand:'Needles',category:'Tops',size:'L',price:100,condition:'Very good',conditionNotes:'Light wear.',images:['assets/front.jpg'],measurements:{chest:58},description:'<p>Original garment.</p>',addedOn:1};
let products=[piece,{...piece,slug:'hidden',name:'Private garment',active:false}],content={site:{email:'hello@japansterdam.com'},journal:{articles:[]}};
const template=await readFile(new URL('../../product.html',import.meta.url),'utf8');
const brandTemplate=await readFile(new URL('../../needles.html',import.meta.url),'utf8');
function env(){return {SOURCE_FETCH:async url=>Response.json(url.endsWith('/products')?products:content),ASSETS:{fetch:async req=>new Response(new URL(req.url).pathname==='/needles.html'?brandTemplate:template)}};}
test('initial HTML contains the actual garment, current price, measurements and one Product schema',async()=>{
 const r=await worker.fetch(new Request('https://japansterdam.com/product.html?p=needles-archive-shirt'),env());
 assert.equal(r.status,200);const html=await r.text();
 for(const value of ['Needles Archive Shirt','58 cm','100.00','Light wear.','data-server-rendered'])assert.ok(html.includes(value),value);
 assert.equal((html.match(/"@type":"Product"/g)||[]).length,1);
 assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
 assert.ok(!html.includes('Private garment'));assert.ok(!html.includes('js/seo.js'));
 assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('legacy links redirect; hidden or unknown identifiers return real 404s',async()=>{
 let r=await worker.fetch(new Request('https://japansterdam.com/product.html?p=legacy'),env());
 assert.equal(r.status,301);assert.match(r.headers.get('Location'),/p=needles-archive-shirt$/);
 for(const id of ['hidden','private-garment','absent']){
  r=await worker.fetch(new Request('https://japansterdam.com/product.html?p='+id),env());assert.equal(r.status,404);assert.match(r.headers.get('X-Robots-Tag'),/noindex/);
 }
});
test('every request reads current data; backend failure is 503, never stale content',async()=>{
 const e=env();products=[{...piece,price:135}];
 let r=await worker.fetch(new Request('https://japansterdam.com/product.html?p=needles-archive-shirt'),e);assert.ok((await r.text()).includes('135.00'));
 products=[{...piece,active:false}];r=await worker.fetch(new Request('https://japansterdam.com/product.html?p=needles-archive-shirt'),e);assert.equal(r.status,404);
 e.SOURCE_FETCH=async()=>new Response('Failure',{status:503});r=await worker.fetch(new Request('https://japansterdam.com/product.html?p=needles-archive-shirt'),e);assert.equal(r.status,503);
 products=[piece,{...piece,slug:'hidden',active:false}];
});
test('brands show available collaboration participants but never hidden or sold items',async()=>{
 const cards=brandCards([piece,{...piece,slug:'sold',sold:true},{...piece,slug:'hidden',active:false},{...piece,slug:'collab',name:'Painter pants',brand:"Needles x Smith's American"}],'Needles');
 assert.equal(cards.count,2);assert.ok(cards.html.includes('Painter pants'));assert.ok(!cards.html.includes('p=hidden'));
 const r=await worker.fetch(new Request('https://japansterdam-web.sam-jesse.workers.dev/needles.html'),env());
 assert.match(r.headers.get('X-Robots-Tag'),/noindex/);assert.ok((await r.text()).includes('needles-archive-shirt'));
});
test('set measurements, metadata and safe schema preserve real product facts',()=>{
 const set={...piece,category:'Sets',measurements:{chest:58,bottom:{inseam:30}}};
 const html=productHTML(set,[set],content);assert.ok(html.includes('58 cm'));assert.ok(html.includes('30 cm'));assert.ok(html.includes('Bottoms'));
 assert.equal(productMeta(piece,'url').title,'Needles Archive Shirt — Japansterdam');
 assert.equal(productSchema({...piece,sold:true},'url').offers.availability,'https://schema.org/SoldOut');
 assert.ok(!jsonScript({name:'</script><script>alert(1)</script>'}).includes('</script>'));
 assert.ok(!publishedDescription('<p>From the Journal: <a href="journal.html?story=secret">Secret</a></p>',content).includes('secret'));
});
