import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRow, probe } from './apify-probe.mjs';

const row = { link: 'https://www.vinted.nl/items/123456-test', title: 'Test item', price: 30, currency: 'EUR', brand: 'Needles', condition: 'Very good', availability: 'available' };

test('normalization preserves uncertainty and never invents comparables', () => {
  const item = normalizeRow(row, '2026-11-04T12:00:00Z');
  assert.equal(item.available, true);
  assert.equal(item.condition, 'very_good');
  assert.deepEqual(item.comparables, []);
  assert.equal(normalizeRow({ ...row, availability: undefined, condition: undefined }, '').available, null);
  assert.equal(normalizeRow({ ...row, price: 41 }, ''), null);
  assert.equal(normalizeRow({ ...row, currency: 'GBP' }, ''), null);
});

test('probe restricts the run, uses header authentication and reports only three results', async () => {
  let posted = 0;
  const fetcher = async (raw, options) => {
    const url = new URL(raw);
    assert.equal(options.headers.Authorization, 'Bearer private-token');
    assert(!url.searchParams.has('token'));
    if (options.method === 'POST') {
      posted++;
      assert.equal(url.searchParams.get('maxTotalChargeUsd'), '0.02');
      assert.equal(url.searchParams.get('timeout'), '90');
      const input = JSON.parse(options.body);
      assert.equal(input.searchQueries.length, 1);
      assert.equal(new URL(input.searchQueries[0]).searchParams.get('brand_ids[]'), '360271');
      assert.equal(new URL(input.searchQueries[0]).searchParams.get('price_to'), '40');
      assert.equal(input.brandIds, '360271');
      assert.equal(input.maxResults, 3);
      assert.equal(input.maxPrice, 40);
      return Response.json({ data: { id: 'Run123', status: 'SUCCEEDED', defaultDatasetId: 'Data123', finishedAt: '2026-11-04T12:00:00Z' } });
    }
    return Response.json([row, row, row, row]);
  };
  const result = await probe({ token: 'private-token', fetcher });
  assert.equal(posted, 1);
  assert.equal(result.items.length, 3);
  assert.equal(result.confirmedAvailable, 3);
});

test('missing tokens and provider failures stop without leaking credentials or retrying starts', async () => {
  await assert.rejects(probe({}), /APIFY_TOKEN/);
  let requests = 0;
  await assert.rejects(probe({ token: 'private-token', fetcher: async () => { requests++; throw new Error('private-token'); } }), (e) => !e.message.includes('private-token'));
  assert.equal(requests, 1);
  await assert.rejects(probe({ token: 'private-token', fetcher: async () => new Response('', { status: 401 }) }), /HTTP 401/);
});


test('second trial increases only the bounded result count and retains brand, sort, price and charge limits',async()=>{
 const result=await probe({token:'fixture',brandIds:'576107',maxResults:10,maxCostUsd:.03,fetcher:async(url,opts)=>{
  if(opts.method==='POST'){
   const u=new URL(url);assert.equal(u.searchParams.get('maxItems'),'10');assert.equal(u.searchParams.get('maxTotalChargeUsd'),'0.03');
   const input=JSON.parse(opts.body);assert.equal(input.maxResults,10);assert.equal(input.sortBy,'newest_first');assert.equal(input.brandIds,'576107');assert.equal(input.maxPrice,40);
   return Response.json({data:{id:'Fixture',status:'SUCCEEDED',defaultDatasetId:'Dataset'}});
  }
  return Response.json(Array.from({length:12},()=>row));
 }});
 assert.equal(result.items.length,10);
 await assert.rejects(probe({token:'fixture',maxResults:100}),/scanbudget/);
});


test('documented photo_links from full item rows reach the photo screener without accepting foreign hosts or seller pictures',()=>{
 const image='https://images1.vinted.net/front.webp',label='https://images2.vinted.net/label.webp';
 const item=normalizeRow({...row,image,photo_links:[image,label,'https://untrusted.example/photo.jpg','http://images1.vinted.net/photo.jpg'],seller_image:'https://images1.vinted.net/seller.jpg'},'2026-11-06T10:00:00Z');
 assert.deepEqual(item.photoUrls,[image,label]);
 assert.equal(normalizeRow({...row,photo_links:'not-an-array'},'').photoUrls.length,0);
});


test('an unfinished provider run uses bounded server waits and one abort, never unlimited status polling',async()=>{
 let starts=0,checks=0,aborts=0;
 await assert.rejects(probe({token:'fixture',now:()=>0,fetcher:async(raw,opts)=>{
  const u=new URL(raw);
  if(u.pathname.endsWith('/abort')){aborts++;return Response.json({});}
  if(opts.method==='POST'){starts++;assert.equal(u.searchParams.get('waitForFinish'),'20');}
  else {checks++;assert.equal(u.searchParams.get('waitForFinish'),'20');}
  return Response.json({data:{id:'Pending',status:'RUNNING'}});
 }}),/afgebroken/);
 assert.equal(starts,1);assert.equal(checks,3);assert.equal(aborts,1);
});
