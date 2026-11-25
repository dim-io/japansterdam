import test from 'node:test';
import assert from 'node:assert/strict';
import {productSEOTitle,articleSEOTitle,publicCommerce,offerPolicy,productBreadcrumb} from '../../js/seo-metadata.js';
import {journalHTML} from './editorial.mjs';
import {knownGeneratedImage,markGeneratedJPEG} from '../src/image-provenance.mjs';
test('separate search title keeps the actual article heading and schema headline',()=>{
 const a={title:'Out of the kiln.',seoTitle:'Moonstar & Shoes Like Pottery — Japansterdam',seoDescription:'Shoemaking in Kurume.',slug:'kiln',published:true,cover:'/photo.jpg',bodyHtml:'<p>Story</p>'};
 const page=journalHTML({journal:{articles:[a]}},[],'kiln');
 assert.equal(page.meta.title,a.seoTitle);assert.equal(page.meta.description,a.seoDescription);
 assert.match(page.html,/<h1>Out of the kiln\.<\/h1>/);assert.equal(page.schema.headline,a.title);
 assert.equal(articleSEOTitle({...a,seoTitle:' '}),'Out of the kiln. — Japansterdam Journal');
});
test('shoe sizes distinguish identical model names without inventing size mappings',()=>{
 const p={name:'Shoes Like Pottery Beige',brand:'Shoes Like Pottery',category:'Footwear',size:'EU 36'};
 assert.notEqual(productSEOTitle(p),productSEOTitle({...p,size:'EU 37'}));
 assert.match(productSEOTitle(p),/Size EU 36/);
 assert.equal(productSEOTitle({...p,name:'Sneaker Size 36'}).match(/36/g).length,1);
});
test('public offer policies use actual rates and omit private provider settings',()=>{
 const c=publicCommerce({shipping:[{country:'NL',cents:795},{country:'NL',cents:-1},{country:'bad',cents:20}],returnsText:"within 14 days after the day they receive the item. Return shipping costs are the customer's responsibility",secret:'private'});
 assert.deepEqual(c,{shipping:[{country:'NL',cents:795}],returns:true});
 const policy=offerPolicy(c);assert.equal(policy.shippingDetails[0].shippingRate.value,'7.95');assert.equal(policy.hasMerchantReturnPolicy.merchantReturnDays,14);
 assert.equal(offerPolicy(publicCommerce({returnsText:'Changed policy'})).hasMerchantReturnPolicy,undefined);
 const bc=productBreadcrumb({name:'Shirt',brand:'Needles'},'https://japansterdam.com/product.html?p=shirt');assert.deepEqual(bc.itemListElement.map(x=>x.position),[1,2,3]);
});
test('provenance annotates confirmed JPEGs without altering pixels or existing source metadata',()=>{
 assert.equal(knownGeneratedImage('products/26ee686a-74ab-4a70-a97a-d919c031b03d.jpg'),true);assert.equal(knownGeneratedImage('products/real-photo.jpg'),false);
 const original=new Uint8Array([255,216,255,218,1,2,255,217]);const marked=markGeneratedJPEG(original.buffer);
 assert.match(new TextDecoder().decode(marked),/trainedAlgorithmicMedia/);assert.deepEqual(marked.slice(-6),original.slice(2));assert.deepEqual(markGeneratedJPEG(marked.buffer),marked);
 assert.deepEqual(markGeneratedJPEG(new Uint8Array([1,2]).buffer),new Uint8Array([1,2]));
});
