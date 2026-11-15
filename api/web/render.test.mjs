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
test('main domain redirects preserve paths and queries without redirecting previews',async()=>{
 for(const [input,expected] of [
  ['http://www.japansterdam.com/product.html?p=needles-archive-shirt','https://japansterdam.com/product.html?p=needles-archive-shirt'],
  ['https://www.japansterdam.com/shop.html?brand=Needles','https://japansterdam.com/shop.html?brand=Needles'],
  ['https://japansterdam.com/index.html?source=home','https://japansterdam.com/?source=home']
 ]){
  const r=await worker.fetch(new Request(input),env());assert.equal(r.status,301);assert.equal(r.headers.get('Location'),expected);
 }
 const r=await worker.fetch(new Request('https://japansterdam-web.sam-jesse.workers.dev/index.html'),env());assert.equal(r.status,200);assert.match(r.headers.get('X-Robots-Tag'),/noindex/);
});
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
test('missing measurements offer a product-specific request without empty tables or invented numbers',()=>{
 const p={...piece,measurements:{}};
 const html=productHTML(p,[p],content);
 assert.ok(html.includes('Measurements are available on request.'));
 assert.ok(html.includes('subject=Measurements%20for%20Needles%20Archive%20Shirt'));
 assert.ok(!html.includes('measurements__list'));
 const shoe={...p,category:'Footwear',size:'EU 36',fitsLike:['M']};
 const footwear=productHTML(shoe,[shoe],content);
 assert.ok(!footwear.includes('<dt>Fits like</dt>'));
 assert.ok(!footwear.includes('Garment measurements'));
});

test('main-domain sitemap includes current products and the permanent brand pages',async()=>{
 const r=await worker.fetch(new Request('https://japansterdam.com/sitemap.xml'),env());
 assert.equal(r.status,200);assert.match(r.headers.get('Content-Type'),/application\/xml/);
 const xml=await r.text();assert.ok(xml.includes('needles.html'));assert.ok(xml.includes('needles-archive-shirt'));assert.ok(!xml.includes('private-garment'));
});

test('home and shop expose current product links in their initial HTML',async()=>{
 const templates={
  '/':await readFile(new URL('../../index.html',import.meta.url),'utf8'),
  '/shop.html':await readFile(new URL('../../shop.html',import.meta.url),'utf8')
 };
 for(const path of Object.keys(templates)){
  const e=env();e.ASSETS.fetch=async req=>new Response(templates[new URL(req.url).pathname]);
  const r=await worker.fetch(new Request('https://japansterdam.com'+path),e),html=await r.text();
  assert.equal(r.status,200);assert.ok(html.includes('href="product.html?p=needles-archive-shirt"'));
  assert.ok(!html.includes('private-garment'));assert.ok(!html.includes('Daan V.'));assert.ok(html.includes('id="jp-page-data"'));
 }
});
test('Journal stories have unique server metadata, safe content and real draft 404s',async()=>{
 const original=content;
 content={...content,journal:{articles:[{slug:'published',published:true,title:'A real story',subtitle:'A closer look',cover:'assets/img/site/about-sam.jpg',bodyHtml:'<h2>Craft</h2><p>Actual editorial content.</p><img src="javascript:alert(1)" onerror="alert(1)"><script>bad()</script>',date:'2026-11-01'},{slug:'private',published:false,title:'Private draft'}]}};
 try{
  const e=env();e.ASSETS.fetch=async()=>new Response(await readFile(new URL('../../journal.html',import.meta.url),'utf8'));
  const r=await worker.fetch(new Request('https://japansterdam.com/journal.html?story=published'),e),html=await r.text();
  assert.equal(r.status,200);assert.ok(html.includes('<h1>A real story</h1>'));assert.ok(html.includes('Actual editorial content.'));assert.ok(html.includes('"@type":"Article"'));
  assert.ok(html.includes('rel="canonical" href="https://japansterdam.com/journal.html?story=published"'));assert.ok(!html.includes('javascript:'));assert.ok(!html.includes('onerror'));assert.ok(!html.includes('bad()'));assert.ok(!html.includes('Private draft'));
  assert.equal((await worker.fetch(new Request('https://japansterdam.com/journal.html?story=private'),e)).status,404);
 }finally{content=original;}
});
test('new image uploads fall back to originals; unrelated optimized paths do not redirect',async()=>{
 const e=env();e.ASSETS.fetch=async()=>new Response('Missing',{status:404});
 const r=await worker.fetch(new Request('https://japansterdam.com/assets/optimized/uploads/new-photo.jpg-480.webp'),e);
 assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'https://japansterdam-api.japansterdam-api.workers.dev/img/products/new-photo.jpg');
 assert.equal((await worker.fetch(new Request('https://japansterdam.com/assets/optimized/arbitrary.example.webp'),e)).status,404);
});

test('checkout responses restrict scripts and framing and never cache order pages',async()=>{
 const r=await worker.fetch(new Request('https://japansterdam.com/checkout.html'),env());
 assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');
 assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
 assert.match(r.headers.get('Content-Security-Policy'),/script-src 'self' https:\/\/static.cloudflareinsights.com/);
});
