import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {commerceRoute,createOrder,quote,syncOrder,sendMessages,reconcile,cleanSettings,readiness} from '../src/checkout.mjs';
const customer={name:'Test Buyer',email:'buyer@example.test',street:'Test street 1',zip:'1000AA',city:'Amsterdam',country:'NL',note:''};
function setup(){
 const db=new DatabaseSync(':memory:');for(const p of ['0001_init.sql','0008_checkout.sql'])db.exec(fs.readFileSync(new URL('../migrations/'+p,import.meta.url),'utf8'));
 const env={requests:0,MOLLIE_API_KEY:'live_fixture',RESEND_API_KEY:'fixture',ORDER_EMAIL_FROM:'Japansterdam <orders@example.test>',DB:{prepare(q){let values=[];return {bind(...v){values=v;return this;},async first(){env.requests++;return db.prepare(q).get(...values)||null;},async all(){env.requests++;return {results:db.prepare(q).all(...values)};},async run(){env.requests++;const r=db.prepare(q).run(...values);return {meta:{changes:Number(r.changes)}};},_query:q,_values:()=>values};},async batch(statements){env.requests++;db.exec('BEGIN');try{const results=[];for(const s of statements){const r=db.prepare(s._query).run(...s._values());results.push({meta:{changes:Number(r.changes)}});}db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 const s=cleanSettings({enabled:true,mode:'live',company:'Japansterdam',kvk:'12345678',address:'Test address',email:'owner@example.test',returnAddress:'Test return address',taxNote:'Applicable taxes included.',deliveryText:'Dispatch within two working days.',returnsText:'14-day withdrawal. Return costs are paid by buyer.',privacyText:'Order details used for fulfillment.',termsText:'Statutory conformity applies.',reviewed:true,shipping:[{country:'NL',cents:695}],methods:['ideal','creditcard']});
 db.prepare("INSERT INTO commerce_settings VALUES('main',?,?)").run(JSON.stringify(s),Date.now());
 for(const slug of ['one','two'])db.prepare('INSERT INTO products VALUES(?,?,0,?)').run(slug,JSON.stringify({slug,name:'Archive shirt',brand:'Needles',size:'L',price:100,active:true,sold:false,condition:'Very good',conditionNotes:'Minimal wear.',images:[]}),Date.now());
 return {db,env,s};
}
let payments=new Map(),starts=0,mails=[];
const nativeFetch=globalThis.fetch;
function provider(){payments=new Map();starts=0;mails=[];globalThis.fetch=async(url,options={})=>{
 if(url==='https://api.resend.com/emails'){mails.push({body:JSON.parse(options.body),key:options.headers['Idempotency-Key']});return Response.json({id:'email'});}
 if(url==='https://api.mollie.com/v2/payments'){
  starts++;const payload=JSON.parse(options.body),id='tr_'+String(starts),p={id,mode:options.headers.Authorization.includes('test_')?'test':'live',amount:payload.amount,metadata:payload.metadata,status:'open',_links:{checkout:{href:'https://www.mollie.com/checkout/'+id}}};payments.set(id,p);return Response.json(p);
 }
 const id=String(url).split('/').pop();if(payments.has(id))return Response.json(payments.get(id));throw Error('Unexpected provider route');
};}
const req=(path,b)=>new Request('https://api.example.test'+path,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'127.0.0.1'},body:JSON.stringify(b)});
async function input(env,slugs=['one']){const cfg=await (await commerceRoute(new Request('https://api.example.test/checkout/config'),env,{})).json();const q=await quote(env,slugs,'NL');return {requestId:crypto.randomUUID(),accessToken:'a'.repeat(64),slugs,customer,accepted:true,expectedTotal:q.total,policyVersion:cfg.policyVersion};}
const create=async(env,b,options)=> (await createOrder(req('/checkout/orders',b),env,options)).json();
test.afterEach(()=>{globalThis.fetch=nativeFetch;});
test('live checkout prices are authoritative; partial reservation rolls back and duplicate requests reuse one payment',async()=>{
 provider();const {db,env}=setup(),b=await input(env);
 await assert.rejects(create(env,{...b,expectedTotal:1}),/Prices or purchase information changed/);assert.equal(starts,0);
 const o=await create(env,b);assert.equal(o.total,10695);assert.equal(starts,1);assert.equal((await create(env,b)).id,o.id);assert.equal(starts,1);
 const blocked=await input(env,['two','one']);await assert.rejects(create(env,blocked),/reserved/);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n,1);assert.equal(db.prepare("SELECT 1 FROM stock_reservations WHERE slug='two'").get(),undefined);
 assert.throws(()=>db.prepare("UPDATE products SET data=json_set(data,'$.price',1) WHERE slug='one'").run(),/piece_reserved/);
});
test('paid callbacks are verified, idempotent, mark stock sold and send one receipt per recipient',async()=>{
 provider();const {db,env}=setup(),o=await create(env,await input(env));
 const p=payments.get('tr_1');p.status='paid';p.amount.value='1.00';await assert.rejects(syncOrder(env,o.id),/verification failed/);assert.equal(JSON.parse(db.prepare("SELECT data FROM products WHERE slug='one'").get().data).sold,false);
 p.amount.value='106.95';await syncOrder(env,o.id);await syncOrder(env,o.id);await sendMessages(env);await sendMessages(env);
 assert.equal(JSON.parse(db.prepare("SELECT data FROM products WHERE slug='one'").get().data).sold,true);assert.equal(mails.length,2);assert(mails[0].body.text.includes('14-day withdrawal'));assert(mails[0].body.text.includes('€106.95'));
 p.status='expired';await syncOrder(env,o.id);assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(o.id).status,'paid');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_reservations').get().n,1);
});
test('only verified terminal status releases a reservation; ambiguous provider failure keeps it locked',async()=>{
 provider();const {db,env}=setup(),o=await create(env,await input(env));payments.get('tr_1').status='pending';await syncOrder(env,o.id);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_reservations').get().n,1);
 globalThis.fetch=async()=>{throw Error('network');};await assert.rejects(syncOrder(env,o.id));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_reservations').get().n,1);
 provider();payments.set('tr_1',{id:'tr_1',mode:'live',status:'expired',amount:{currency:'EUR',value:'106.95'},metadata:{order_id:o.id}});await syncOrder(env,o.id);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_reservations').get().n,0);
});
test('private tests never reserve or sell real stock; public calls cannot start a test payment',async()=>{
 provider();const {db,env,s}=setup();env.MOLLIE_API_KEY='test_fixture';s.enabled=false;s.mode='test';db.prepare("UPDATE commerce_settings SET data=?").run(JSON.stringify(s));
 const b=await input(env);await assert.rejects(create(env,b),/not available/);const o=await create(env,b,{test:true});payments.get('tr_1').status='paid';await syncOrder(env,o.id);await sendMessages(env);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_reservations').get().n,0);assert.equal(JSON.parse(db.prepare("SELECT data FROM products WHERE slug='one'").get().data).sold,false);assert.equal(mails.length,0);
});
test('hidden/sold pieces and unsupported destinations cannot be purchased; live activation requires complete setup',async()=>{
 const {db,env,s}=setup();assert(readiness(env,s).ready);assert(!readiness({},s).ready);assert(!readiness(env,{...s,reviewed:false}).ready);
 await assert.rejects(quote(env,['one'],'US'),/country/);db.prepare("UPDATE products SET data=json_set(data,'$.active',json('false')) WHERE slug='one'").run();await assert.rejects(quote(env,['one'],'NL'),/no longer available/);
 await assert.rejects(commerceRoute(new Request('https://api.example.test/admin/checkout',{method:'PUT',body:JSON.stringify({...s,reviewed:false})}),env,{}, {admin:true}),/Finish setup/);
});
test('order capabilities protect status and withdrawal is acknowledged once without automatic refund or restock',async()=>{
 provider();const {db,env}=setup(),b=await input(env),o=await create(env,b);payments.get('tr_1').status='paid';await syncOrder(env,o.id);
 await assert.rejects(commerceRoute(req('/checkout/status',{id:o.id,accessToken:'b'.repeat(64)}),env,{}),/not found/);
 const post=(email)=>commerceRoute(req('/checkout/withdraw',{orderNumber:'JPN-'+o.id,email,confirmed:true,note:'One shirt'}),env,{});
 const wrong=await(await post('wrong@example.test')).json(),right=await(await post(customer.email)).json();assert.deepEqual(wrong,right);await post(customer.email);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM withdrawals').get().n,1);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_messages WHERE kind LIKE 'withdrawal%'").get().n,2);assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(o.id).status,'paid');
});
test('ambiguous create is not released or replaced with a different idempotency key',async()=>{
 provider();const {db,env}=setup(),b=await input(env);const keys=[];globalThis.fetch=async(url,opt)=>{keys.push(opt.headers['Idempotency-Key']);throw Error('timeout');};
 await assert.rejects(create(env,b));await assert.rejects(create(env,b));assert.deepEqual(keys,[b.requestId,b.requestId]);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_reservations').get().n,1);assert.equal(db.prepare('SELECT status FROM orders').get().status,'creating');
});

test('concurrent buyers cannot reserve and pay for the same unique piece twice',async()=>{
 provider();const {db,env}=setup(),a=await input(env),b=await input(env);
 const results=await Promise.allSettled([create(env,a),create(env,b)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(starts,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_reservations').get().n,1);
});

test('a busy reconciliation stays within the Cloudflare Free 50-request limit',async()=>{
 provider();const {db,env}=setup();
 for(const slug of ['three','four'])db.prepare('INSERT INTO products VALUES(?,?,0,?)').run(slug,JSON.stringify({slug,name:'Test shirt',brand:'Needles',size:'L',price:100,active:true,sold:false}),Date.now());
 for(const slug of ['one','two','three','four'])await create(env,await input(env,[slug]));
 for(const payment of payments.values())payment.status='paid';
 env.requests=0;let network=0;const upstream=globalThis.fetch;globalThis.fetch=async(...a)=>{network++;return upstream(...a);};await reconcile(env);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='paid'").get().n,4);
 assert(env.requests+network<=50,`Used ${env.requests+network} requests`);
});
