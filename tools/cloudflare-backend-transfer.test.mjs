import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rewrite,signedURL,OLD_ORIGIN,NEW_ORIGIN,copyImages,SOURCE,snapshot} from './cloudflare-backend-transfer.mjs';
test('only source image origin changes; numeric measurements and text survive',()=>{assert.equal(rewrite(52),52);assert.equal(rewrite(`prefix ${OLD_ORIGIN}/images/a.jpg suffix`),`prefix ${NEW_ORIGIN}/images/a.jpg suffix`);});
test('private SQL cannot be uploaded to a foreign or insecure host',()=>{for(const u of ['http://x.r2.cloudflarestorage.com/a','https://evil.test/a','https://x.r2.cloudflarestorage.com.evil.test/a'])assert.throws(()=>signedURL(u));assert.equal(signedURL('https://x.r2.cloudflarestorage.com/a'),'https://x.r2.cloudflarestorage.com/a');});
test('binary photos and their metadata are preserved and independently verified',async()=>{
 const key={name:'products/test.jpg',metadata:{contentType:'image/jpeg'}},bytes=Buffer.from([0,255,26,10,77]);let stored;
 const source=async(path,opts,raw)=>raw?bytes:{result:[key],result_info:{}};
 const target=async(path,opts,raw)=>{if(raw)return stored;if(path.endsWith('/bulk')){const [entry]=JSON.parse(opts.body);assert.deepEqual(entry.metadata,key.metadata);stored=Buffer.from(entry.value,'base64');return {success:true};}return {result:stored?[key]:[],result_info:{}};};
 assert.equal((await copyImages(source,target,'target')).count,1);assert.deepEqual(stored,bytes);
});
test('corrupted destination photo aborts verification',async()=>{
 const source=async(path,opts,raw)=>raw?Buffer.from('original'):{result:[{name:'a'}],result_info:{}};
 const target=async(path,opts,raw)=>raw?Buffer.from('corrupted'):{result:[],result_info:{}};
 await assert.rejects(copyImages(source,target,'target'),/image_bytes_mismatch/);
});
test('database verification covers hidden rows and schema as well as origin rewrite',async()=>{
 const api=async(path,{body})=>{const {sql}=JSON.parse(body);let rows;if(sql.includes('sqlite_master'))rows=[{type:'table',name:'products',tbl_name:'products',sql:'CREATE TABLE products(data TEXT)'}];else rows=[{data:OLD_ORIGIN+'/images/hidden.jpg',active:0}];return {result:[{results:rows,success:true}]};};
 const a=await snapshot(api,SOURCE.database,true),b=await snapshot(api,SOURCE.database,false);assert.equal(a.tables.products.rows,1);assert.notEqual(a.tables.products.hash,b.tables.products.hash);assert.equal(a.schema,b.schema);
});
