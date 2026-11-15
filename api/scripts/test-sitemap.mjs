import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import worker from '../src/index.js';
import { sitemapXML, staticPaths } from '../src/sitemap.mjs';
import { createProductRoutes } from '../../js/product-urls.js';

const products = [
  {slug:'legacy-shirt',name:'Archive shirt',brand:'Needles',size:'M'},
  {slug:'sold-shirt',name:'Archive shirt',brand:'Needles',size:'L',sold:true},
  {slug:'secret',name:'Private shirt',brand:'Needles',size:'XL',active:false},
];
const content = {journal:{articles:[
  {slug:'fabric & fit',title:'Fabric & fit',published:true},
  {slug:'draft-story',title:'Private draft',published:false},
  {slug:'not-yet-published',title:'Not published'},
]}};
test('sitemap follows public visibility and canonical route collisions, including sold archives', () => {
  const xml = sitemapXML(products,content);
  const routes = createProductRoutes(products.filter(p=>p.active!==false));
  for (const p of products.slice(0,2)) assert.ok(xml.includes(routes.urlFor(p.slug)));
  assert.ok(xml.includes('journal.html?story=fabric%20%26%20fit'));
  for (const privateText of ['secret','private-shirt','draft-story','not-yet-published']) assert.ok(!xml.includes(privateText));
  assert.ok(!xml.includes('lastmod'));
  assert.equal((xml.match(/<loc>/g)||[]).length,staticPaths.length+3);
});
test('sitemap reads current CMS data on every request and responds as XML', async () => {
  let items=products;
  const env={DB:{prepare(query){return {
    all:async()=>({results:items.map(p=>({data:JSON.stringify(p)}))}),
    first:async()=>({data:JSON.stringify(content)}),
  };}}};
  const request=()=>worker.fetch(new Request('https://api.example/public/sitemap.xml'),env);
  let response=await request();
  assert.equal(response.status,200);
  assert.match(response.headers.get('Content-Type'),/^application\/xml/);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.ok((await response.text()).includes('needles-archive-shirt-size-m'));
  items=products.map(p=>({...p,active:false}));
  response=await request();
  assert.ok(!(await response.text()).includes('product.html?p='));
});
test('robots delegates the live sitemap and the fixed sitemap matches public static pages',async()=>{
  const robots=await readFile(new URL('../../robots.txt',import.meta.url),'utf8');
  assert.ok(robots.includes('Sitemap: https://japansterdam-api.sam-jesse.workers.dev/public/sitemap.xml'));
  const xml=await readFile(new URL('../../sitemap.xml',import.meta.url),'utf8');
  for(const path of staticPaths) assert.ok(xml.includes('<loc>https://japansterdam.com/'+path+'</loc>'));
  for(const path of ['checkout.html','returns.html','admin/','404.html']) assert.ok(!xml.includes('<loc>https://japansterdam.com/'+path+'</loc>'));
});
