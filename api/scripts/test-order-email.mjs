import test from 'node:test';
import assert from 'node:assert/strict';
import {orderEmailHtml,orderEmailAttachments,sampleEmailOrder} from '../src/order-email.mjs';

test('receipt escapes product, customer and policy text, retaining readable newlines',()=>{
 const o=sampleEmailOrder({company:'Japansterdam',email:'hello@example.test',shipping:[{country:'NL',cents:795}],returnsText:'Return within 14 days.\nContact us first.'});
 const items=JSON.parse(o.items);items[0].name='<script>alert(1)</script>';o.items=JSON.stringify(items);
 const c=JSON.parse(o.customer);c.name='Buyer <img src=x>';c.note='Pack <carefully>';o.customer=JSON.stringify(c);
 const html=orderEmailHtml(o,{owner:true});
 assert(!html.includes('<script>'));assert(!html.includes('<img src=x>')); assert(html.includes('&lt;script&gt;'));
 assert(html.includes('Buyer &lt;img src=x&gt;'));assert(html.includes('Pack &lt;carefully&gt;'));
 assert(html.includes('Return within 14 days.<br>Contact us first.'));assert(html.includes('€107.95'));
 assert(!orderEmailHtml(o).includes('Pack &lt;carefully&gt;'));
});

// Verify branding in every template, including the actual paid-order variants.
test('all order emails use the original wordmark and readable curated positioning',()=>{
 const o=sampleEmailOrder({company:'Japansterdam',email:'hello@example.test'});
 for(const opts of [{},{owner:true},{test:true}]){
  const html=orderEmailHtml(o,opts);
  assert(html.includes('src="cid:japansterdam-wordmark"'));
  assert(!/<img[^>]+src="https?:/.test(html));
  const [logo]=orderEmailAttachments();
  assert.equal(logo.content_id,'japansterdam-wordmark');
  assert.equal(logo.content_type,'image/png');
  assert.equal(logo.path,'https://japansterdam.com/assets/img/site/header-logo.png');
  assert(html.includes('alt="Japansterdam"'));
  assert(html.includes('max-width:100%;height:auto'));
  assert(html.includes('Curated Japanese Garments'));
  assert(!html.includes('PRE-OWNED &amp; ARCHIVE PIECES'));
  assert(!html.includes('×××'));
 }
});
