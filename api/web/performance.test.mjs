import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clientSnapshot} from './client-snapshot.mjs';
import {bundlePageAssets} from './bundles.mjs';
import {editorialSource,editorialKey,imageVariant} from '../../js/responsive-images.js';
import {articleBody} from './editorial.mjs';
import worker from './worker.mjs';
const product={slug:'piece',name:'A shirt',brand:'Needles',category:'Tops',description:'Unique garment description',measurements:{chest:58},images:['a.jpg','b.jpg','c.jpg'],imageFrames:[{url:'a.jpg',x:20},{url:'c.jpg',x:80}],price:125};
const content={home:{testimonials:['private testimonial']},journal:{articles:[{slug:'one',title:'Story one',published:true,bodyHtml:'<p>'+('word '.repeat(450))+'</p>'},{slug:'two',title:'Story two',published:true,bodyHtml:'<p>Different full article</p>'},{slug:'private',title:'Unpublished draft',published:false,bodyHtml:'Draft secret'}]}};
test('page snapshots keep current product details and only the open article body without mutating CMS data',()=>{
 const shop=clientSnapshot(content,[product],new URL('https://japansterdam.com/shop.html'));
 assert.ok(!JSON.stringify(shop).includes('Draft secret'));assert.ok(!JSON.stringify(shop).includes('private testimonial'));
 assert.equal(shop.content.journal.articles[0].readingMinutes,3);
 assert.equal(shop.content.journal.articles[0].bodyHtml,undefined);
 assert.equal(shop.products[0].description,undefined);assert.equal(shop.products[0].measurements,undefined);
 assert.equal(shop.products[0].price,125);assert.equal(shop.products[0].images.length,2);assert.equal(shop.products[0].imageFrames.length,1);
 const pdp=clientSnapshot(content,[product],new URL('https://japansterdam.com/product.html?p=piece'));
 assert.equal(pdp.products[0].description,product.description);assert.deepEqual(pdp.products[0].measurements,{chest:58});assert.equal(pdp.products[0].images.length,3);
 const story=clientSnapshot(content,[product],new URL('https://japansterdam.com/journal.html?story=two'));
 assert.equal(story.content.journal.articles[0].bodyHtml,undefined);assert.ok(story.content.journal.articles[1].bodyHtml.includes('Different full article'));
 assert.ok(!('products' in clientSnapshot(content,[product],new URL('https://japansterdam.com/about.html'))));
 assert.equal(product.images.length,3);assert.ok(content.journal.articles[0].bodyHtml);
});
test('editorial image fallbacks accept only allowlisted public sources matching the requested key',async()=>{
 const source='https://images.metmuseum.org/CRDImages/as/original/DP330783.jpg';
 const path=imageVariant(source,480);assert.ok(path.includes('/editorial/'+editorialKey(source)+'-480.webp'));
 const env={ASSETS:{fetch:async()=>new Response('Missing',{status:404})}};
 const response=await worker.fetch(new Request('https://japansterdam.com'+path),env);
 assert.equal(response.status,302);assert.equal(response.headers.get('Location'),source);
 for(const bad of ['http://images.metmuseum.org/a.jpg','https://images.metmuseum.org.evil.example/a.jpg','https://user:secret@images.metmuseum.org/a.jpg','https://127.0.0.1/a.jpg'])assert.equal(editorialSource(bad),null);
 assert.equal((await worker.fetch(new Request('https://japansterdam.com'+path.replace(/source=.*/, 'source='+encodeURIComponent('https://world-fn.com/other.jpg'))),env)).status,404);
 assert.equal(editorialKey('hello'),'a430d84680aabd0b');
 const body=articleBody('<img src="https://image-cdn.hypb.st/photo.jpg?fit=max&amp;w=1080">');
 assert.ok(body.includes(encodeURIComponent('https://image-cdn.hypb.st/photo.jpg?fit=max&w=1080')));assert.ok(!body.includes('amp%3Bw'));
});
test('bundles share versioned modules, retain external scripts, preserve font URLs and preload dependencies',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jp-bundle-test-'));
 try{
  await mkdir(join(root,'js'));await mkdir(join(root,'css'));
  await writeFile(join(root,'js/shared.js'),'export const shared = window.innerWidth;');
  await writeFile(join(root,'js/a.js'),'import {shared} from "./shared.js?v=1"; console.log(shared);');
  await writeFile(join(root,'js/b.js'),'import {shared} from "./shared.js?v=2"; console.log(shared);');
  await writeFile(join(root,'css/style.css'),'@font-face{font-family:Test;src:url(../assets/fonts/test.woff2)} body {color: black}');
  const files=['a','b'].map(n=>join(root,n+'.html'));
  for(let i=0;i<files.length;i++)await writeFile(files[i],`<head><link rel="stylesheet" href="css/style.css?v=1"></head><script type="module" src="js/${i?'b':'a'}.js?v=1"></script><script src="https://example.com/analytics.js"></script>`);
  const meta=await bundlePageAssets(root,files);
  assert.equal(Object.keys(meta.inputs).filter(p=>p.includes('shared.js')).length,1);
  const html=await readFile(files[0],'utf8');assert.match(html,/src="\/assets\/bundles\/a-[A-Z0-9]+\.js"/);assert.match(html,/rel="modulepreload"/);assert.ok(html.includes('https://example.com/analytics.js'));
  const cssFile=Object.keys(meta.outputs).find(p=>p.endsWith('.css'));const css=await readFile(join(root,cssFile),'utf8');assert.ok(css.includes('/assets/fonts/test.woff2'));
 }finally{await rm(root,{recursive:true,force:true});}
});
