import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const { default: worker, cleanProduct, listProducts } = await import('data:text/javascript;base64,' + Buffer.from(source + '\nexport { cleanProduct, listProducts };').toString('base64'));
const product = { name: 'Archive shirt', category: 'Tops', price: 100, condition: 'Very good', conditionNotes: 'Light wear.', images: ['https://example.com/front.jpg','https://example.com/back.jpg'] };
const clean = (overrides = {}) => cleanProduct({ ...product, ...overrides }, 'shirt', 123);
test('legacy products stay active; drafts can be completed before activation', () => {
  assert.equal(clean().active, true);
  const draft = clean({active:false,condition:'',conditionNotes:''});
  assert.equal(draft.active, false);
  assert.throws(() => clean({...draft,active:true}), /Choose a condition/);
  for (const active of ['false',0,null]) assert.throws(() => clean({active}), /Active must/);
});
test('public catalogue excludes inactive products; admin source retains them', async () => {
  const items = [clean(),{...clean(),slug:'hidden',active:false},{...product,slug:'legacy'}];
  const env = { DB: { prepare() { return { all: async () => ({results:items.map((p)=>({data:JSON.stringify(p)}))}) }; } } };
  assert.equal((await listProducts(env)).length,3);
  const response = await worker.fetch(new Request('https://worker.test/public/products'),env);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).map((p)=>p.slug),['shirt','legacy']);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('frames remain attached to their URLs after reordering, with bounded data', () => {
  const frame={url:product.images[0],x:50,y:0,fit:'cover'};
  const saved=clean({images:[...product.images].reverse(),imageFrames:[frame]});
  assert.deepEqual(saved.imageFrames,[frame]);
  assert.equal(clean({imageFrames:[{...frame,fit:'contain'}]}).imageFrames[0].fit,'contain');
  for (const patch of [{x:-1},{y:101},{x:'50'},{fit:'bad'},{url:'unknown'}]) assert.throws(()=>clean({imageFrames:[{...frame,...patch}]}),/Invalid photo frame/);
  assert.throws(()=>clean({imageFrames:{}}),/Invalid photo frames/);
});
test('public frame styles match preview and accept only safe CSS values',async()=>{
  const code=await readFile(new URL('../../js/image-frames.js',import.meta.url),'utf8');
  const {imageFrameStyle}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const url=product.images[0];
  assert.equal(imageFrameStyle({},url),'object-fit:cover;object-position:50% 50%');
  assert.equal(imageFrameStyle({imageFrames:[{url,x:20,y:0,fit:'contain'}]},url),'object-fit:contain;object-position:20% 0%');
  assert.equal(imageFrameStyle({imageFrames:[{url,x:'url(evil)',y:200,fit:'bad'}]},url),'object-fit:cover;object-position:50% 100%');
});
