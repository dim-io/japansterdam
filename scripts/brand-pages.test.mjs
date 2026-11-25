import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {BRAND_PAGES,brandPage} from '../js/brand-pages.js';
import {staticPaths} from '../api/src/sitemap.mjs';
import worker from '../api/web/worker.mjs';

test('all listed brands have crawlable pages with live, isolated collections',async()=>{
 assert.equal(BRAND_PAGES.length,28);
 const sitemap=await readFile(new URL('../sitemap.xml',import.meta.url),'utf8');
 for(const b of BRAND_PAGES){
  const path=b.slug+'.html',html=await readFile(new URL('../'+path,import.meta.url),'utf8');
  assert.ok(html.includes('href="https://japansterdam.com/'+path+'"'),path);
  assert.ok(html.replaceAll('&amp;','&').toLowerCase().includes(('<h1 class="page-title">'+b.brand+'</h1>').toLowerCase()),path);
  assert.equal(staticPaths.includes(path),b.listed!==false);
  assert.equal(sitemap.includes('<loc>https://japansterdam.com/'+path+'</loc>'),b.listed!==false,path+': static sitemap');
  const piece={slug:'available',name:'Available selection',brand:b.brand,category:'Tops',size:'M',price:100,images:[],addedOn:1};
  const env={SOURCE_FETCH:async url=>Response.json(url.endsWith('/products')?[
   piece,{...piece,slug:'hidden',active:false,name:'Hidden selection'},
   {...piece,slug:'sold',sold:true,name:'Sold selection'},
   {...piece,slug:'unrelated',brand:'Other label',name:'Unrelated selection'}
  ]:{site:{},journal:{articles:[]}}),ASSETS:{fetch:async()=>new Response(html)}};
  const r=await worker.fetch(new Request('https://japansterdam.com/'+path),env);
  assert.equal(r.status,200,path);
  const rendered=await r.text();
  const grid=rendered.match(/<div class="grid" id="brand-pieces">([\s\S]*?)<\/div>/)[1];
  assert.ok(grid.includes('Available selection'),path);
  for(const name of ['Hidden selection','Sold selection','Unrelated selection'])assert.ok(!grid.includes(name),path+': '+name);
  assert.ok(rendered.includes('aria-live="polite">1 piece</p>'));
 }
});
test('brand destinations normalize existing CMS spellings without rewriting collaboration credits',()=>{
 assert.equal(brandPage('Ts(S)').slug,'ts-s');
 assert.equal(brandPage('WTAPS').slug,'wtaps');
 assert.equal(brandPage('Uniform Experiment').slug,'uniform-experiment');
 assert.equal(brandPage('Moonstar').slug,'moonstar');
 assert.equal(brandPage('Shoes Like Pottery by Moonstar').slug,'shoes-like-pottery');
 assert.equal(brandPage('Unknown'),undefined);
});
