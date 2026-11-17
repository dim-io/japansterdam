import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {accountingRoute} from '../src/accounting.mjs';
import {allocate,cleanEntry,cleanSettings,bookView,validatePosting,csv} from '../src/accounting-core.mjs';
import worker from '../src/index.js';
const purchase={date:'2026-11-01',description:'Vintage jacket',channel:'Vinted',reference:'v-1',seller:'Seller',sellerType:'private',country:'NL',amountCents:4500,buyerFeeCents:295,inboundShippingCents:465,otherCostCents:0,lines:[{description:'Vintage jacket',amountCents:4500}],paidFrom:'private'};
const sale={date:'2026-11-02',description:'Jacket sold',itemKey:'1:0',amountCents:12000,shippingChargedCents:795,feeCents:600,outboundShippingCents:695,packagingCents:200,otherCostCents:0,costsConfirmed:true,paidFrom:'business'};
const posted=(id,kind,data)=>({id,kind,state:'posted',data:cleanEntry(data,kind,'posted')});
function setup(){const db=new DatabaseSync(':memory:');for(const file of ['0001_init.sql','0009_accounting.sql'])db.exec(fs.readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));const storage=new Map();const env={DB:{prepare(sql){let args=[];return {sql,bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};},async batch(ops){db.exec('BEGIN');try{const out=[];for(const op of ops)out.push(await op.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}},IMAGES:{async put(k,v){storage.set(k,v);},async get(k){return storage.get(k)?.buffer||null;},async delete(k){storage.delete(k);}}};return {env,db,storage};}
const req=(p,method='GET',b)=>new Request('https://example.test/admin/accounting'+p,{method,...(b?{headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{})});
const call=async(env,p,method,b)=>(await accountingRoute(req(p,method,b),env,{id:1})).json();
async function create(env,kind,data){return call(env,'/entries','POST',{kind,data});}
async function post(env,e){return call(env,`/entries/${e.id}/post`,'POST',{revision:e.revision});}
test('screenshot arithmetic and bundle allocations reconcile exactly, including large cents',()=>{
 assert.equal(bookView([posted(1,'purchase',purchase)],{},2026).inventoryValue,5260);
 assert.deepEqual(allocate(760,[4500]),[760]);assert.deepEqual(allocate(5,[1,1,1]),[2,2,1]);
 for(const weights of [[1,2,3],[12345678,45678901,98765432]]){const a=allocate(300000000,weights);assert.equal(a.reduce((s,n)=>s+n,0),300000000);}
});
test('unsold purchases are inventory, not immediately deducted from profit; selling fees never reduce KOR turnover',()=>{
 const p=posted(1,'purchase',purchase),s=posted(2,'sale',sale);
 const before=bookView([p],{},2026);assert.equal(before.resultBeforeTaxes,0);assert.equal(before.inventoryValue,5260);
 const after=bookView([p,s],{},2026);assert.equal(after.inventoryValue,0);assert.equal(after.costOfSales,5260);assert.equal(after.korTurnover,12795);assert.equal(after.resultBeforeTaxes,6040);
});
test('KOR application is pending, confirmed status needs a valid date, and threshold uses the full sale',()=>{
 assert.equal(cleanSettings().korStatus,'requested');assert.throws(()=>cleanSettings({korStatus:'confirmed'}));assert.throws(()=>cleanSettings({korStatus:'confirmed',korStart:'2026-13-02'}));
 const s=bookView([posted(1,'purchase',purchase),posted(2,'sale',sale)],{otherTurnover:{2026:1990000}},2026);assert.equal(s.korExceeded,true);assert.equal(s.korRemaining,0);
});
test('draft and void entries do not count and year-end stock excludes later years',()=>{
 const p=posted(1,'purchase',purchase);assert.equal(bookView([{...p,state:'draft'}],{},2026).purchases,0);assert.equal(bookView([{...p,state:'void'}],{},2026).inventoryValue,0);
 assert.equal(bookView([p],{},2025).inventoryValue,0);
});
test('full returns reverse revenue and COGS only when restocked; partial refunds do not silently recreate stock',()=>{
 const rows=[posted(1,'purchase',purchase),posted(2,'sale',sale)];const full=posted(3,'refund',{date:'2026-11-03',description:'Return',amountCents:12795,saleId:2,restock:true});
 assert.equal(bookView([...rows,full],{},2026).inventoryValue,5260);assert.equal(bookView([...rows,full],{},2026).costOfSales,0);assert.equal(bookView([...rows,full],{},2026).revenue,0);
 assert.throws(()=>validatePosting(rows,'refund',{date:'2026-11-03',amountCents:3000,saleId:2,restock:true}));
 assert.throws(()=>validatePosting(rows,'sale',sale));
});
test('invalid money, dates, bundle totals and unconfirmed costs cannot be posted',()=>{
 for(const amountCents of [-1,1.5,NaN,Infinity])assert.throws(()=>cleanEntry({...purchase,amountCents},'purchase','posted'));
 assert.throws(()=>cleanEntry({...purchase,date:'2026-02-30'},'purchase','posted'));
 assert.throws(()=>cleanEntry({...purchase,amountCents:1},'purchase','draft'));
 assert.throws(()=>cleanEntry({...sale,costsConfirmed:false},'sale','posted'));
});
test('real SQLite workflow posts once, prevents double sales, retains corrections and exports history',async()=>{
 const {env,db}=setup();let p=await create(env,'purchase',purchase);p=await post(env,p);const s=await create(env,'sale',sale);await post(env,s);
 await assert.rejects(()=>post(env,s));const duplicate=await create(env,'sale',sale);await assert.rejects(()=>post(env,duplicate));
 await assert.rejects(()=>call(env,'/entries/1','PUT',{revision:p.revision,data:purchase}));
 await assert.rejects(()=>call(env,'/entries/1/void','POST',{revision:p.revision,reason:'Test correction'}));
 let refund=await create(env,'refund',{date:'2026-11-03',description:'Full return',amountCents:12795,saleId:s.id,restock:true});refund=await post(env,refund);
 const summary=await call(env,'?year=2026');assert.equal(summary.summary.inventoryValue,5260);
 const exp=await call(env,'/export');assert.ok(exp.events.length>=6);assert.equal(exp.entries.length,4);assert.ok(exp.csv.includes('Kaal bedrag cent'));
 assert.throws(()=>db.exec('DELETE FROM accounting_entries'));assert.throws(()=>db.exec('DELETE FROM accounting_events'));
});
test('refund cap is enforced atomically by SQLite, not just preflight checks',async()=>{
 const {env,db}=setup();await post(env,await create(env,'purchase',purchase));await post(env,await create(env,'sale',sale));
 await post(env,await create(env,'refund',{date:'2026-11-03',description:'Partial',amountCents:10000,saleId:2}));const r=await create(env,'refund',{date:'2026-11-03',description:'Too much',amountCents:5000,saleId:2});
 assert.throws(()=>db.prepare("UPDATE accounting_entries SET state='posted' WHERE id=?").run(r.id));
});
test('evidence stays in a private namespace, records checksum and downloads behind authentication',async()=>{
 const {env,storage}=setup();const p=await create(env,'purchase',purchase);const form=new FormData();form.append('file',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'proof.png',{type:'image/png'}));
 const r=await accountingRoute(new Request(`https://example.test/admin/accounting/entries/${p.id}/documents`,{method:'POST',body:form}),env,{id:1});const doc=await r.json();assert.equal(doc.sha256.length,64);assert.ok([...storage.keys()][0].startsWith('accounting-private/'));
 const f=await call(env,'/documents/'+doc.id);assert.equal(f.mime,'image/png');assert.ok(f.base64);
 const result=await worker.fetch(new Request('https://example.test/admin/accounting/export'),env,{});assert.equal(result.status,401);
 const image=await worker.fetch(new Request('https://example.test/img/accounting-private/'+doc.id),env,{});assert.equal(image.status,404);
});
test('CSV neutralizes spreadsheet formulas without corrupting negative numeric money',()=>{const text=csv([['=HYPERLINK("x")',-123,'safe']]);assert.ok(text.includes("'=HYPERLINK"));assert.ok(text.includes('"-123"'));});
test('posted payment metadata can be reconciled without changing immutable financial amounts',async()=>{
 const {env,db}=setup();const p=await post(env,await create(env,'purchase',purchase));
 const paid=await call(env,'/entries/1/payment','POST',{revision:p.revision,paidFrom:'business',paymentReference:'bank-1',reconciled:true});
 assert.equal(paid.data.reconciled,true);assert.equal(paid.data.amountCents,4500);assert.equal(paid.data.paymentReference,'bank-1');
 assert.throws(()=>db.prepare('UPDATE accounting_entries SET data=? WHERE id=1').run(JSON.stringify({...paid.data,amountCents:1})));
});
