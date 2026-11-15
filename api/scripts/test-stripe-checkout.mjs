import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import Stripe from 'stripe';
import {createOrder,commerceRoute,syncOrder,cleanSettings,readiness} from '../src/checkout.mjs';

const nativeFetch=globalThis.fetch;
const buyer={name:'Test buyer',email:'buyer@example.test',street:'Test street 1',zip:'1000AA',city:'Amsterdam',country:'NL'};
const signingSecret='fixture-webhook-signature';
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0001_init.sql','0008_checkout.sql'])db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 const env={STRIPE_TEST_API_KEY:'rk_test_fixture',STRIPE_LIVE_API_KEY:'rk_live_fixture',STRIPE_TEST_ACCOUNT_ID:'acct_testfixture',STRIPE_LIVE_ACCOUNT_ID:'acct_livefixture',STRIPE_TEST_WEBHOOK_SECRET:signingSecret+'-test',STRIPE_LIVE_WEBHOOK_SECRET:signingSecret+'-live',RESEND_API_KEY:'fixture',ORDER_EMAIL_FROM:'orders@example.test',DB:{
  prepare(q){let values=[];return{bind(...v){values=v;return this;},async first(){return db.prepare(q).get(...values)||null;},async all(){return {results:db.prepare(q).all(...values)};},async run(){const r=db.prepare(q).run(...values);return {meta:{changes:Number(r.changes)}};},q,values:()=>values};},
  async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>({meta:{changes:Number(db.prepare(s.q).run(...s.values()).changes)}}));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}
 }};
 const settings=cleanSettings({provider:'stripe',taxMode:'manual_confirmed',enabled:true,mode:'live',company:'Japansterdam',kvk:'12345678',address:'Test business address',email:'owner@example.test',returnAddress:'Test return address',taxNote:'Confirmed tax wording.',deliveryText:'Tracked delivery.',returnsText:'14-day withdrawal.',privacyText:'Order processing.',termsText:'Purchase terms.',reviewed:true,shipping:[{country:'NL',cents:795}]});
 const save=s=>db.prepare("INSERT OR REPLACE INTO commerce_settings VALUES('main',?,?)").run(JSON.stringify(s),Date.now());save(settings);
 db.prepare('INSERT INTO products VALUES(?,?,0,?)').run('one',JSON.stringify({slug:'one',name:'Archive jacket',brand:'Needles',size:'L',category:'Tops',price:100,active:true,sold:false,condition:'Very good',conditionNotes:'Light wear.',images:[]}),Date.now());
 const sessions=new Map(),requests=[],mails=[];let uncertain=false,accountMismatch=false;
 globalThis.fetch=async(url,opts={})=>{
  const u=new URL(String(url));
  if(u.hostname==='api.resend.com'){mails.push(JSON.parse(opts.body));return Response.json({id:'mail_fixture'});}
  assert.equal(u.hostname,'api.stripe.com');
  const headers=new Headers(opts.headers),live=headers.get('authorization').includes('rk_live_');
  requests.push({path:u.pathname,method:opts.method||'GET',headers,body:opts.body});
  if(u.pathname==='/v1/account')return Response.json({id:accountMismatch?'acct_wrong':live?env.STRIPE_LIVE_ACCOUNT_ID:env.STRIPE_TEST_ACCOUNT_ID,country:'NL',charges_enabled:true,payouts_enabled:true,details_submitted:true});
  if(u.pathname==='/v1/checkout/sessions'&&opts.method==='POST'){
   const key=headers.get('idempotency-key');let existing=[...sessions.values()].find(s=>s.metadata.order_id===key);
   if(!existing){const body=new URLSearchParams(opts.body);const id='cs_'+(live?'live':'test')+'_fixture'+sessions.size;
    existing={id,livemode:live,mode:'payment',url:'https://checkout.stripe.com/c/pay/'+id,currency:'eur',amount_total:10795,status:'open',payment_status:'unpaid',metadata:{order_id:body.get('metadata[order_id]')},client_reference_id:body.get('client_reference_id'),payment_intent:null,collected_information:{shipping_details:{name:'Delivered Buyer',address:{line1:'Delivery street 2',postal_code:'1000BB',city:'Amsterdam',country:'NL'}}}};sessions.set(id,existing);}
   if(uncertain){uncertain=false;throw new Error('transport failed after Stripe created session');}
   return Response.json(existing);
  }
  if(u.pathname.startsWith('/v1/checkout/sessions/'))return Response.json(sessions.get(u.pathname.split('/').pop()));
  if(u.pathname.startsWith('/v1/payment_intents/'))return Response.json([...sessions.values()].find(s=>s.payment_intent?.id===u.pathname.split('/').pop()).payment_intent);
  throw new Error('Unexpected Stripe request '+u.pathname);
 };
 const request=(id=crypto.randomUUID(),token='a'.repeat(64))=>new Request('https://api.example.test/checkout/orders',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://japansterdam.com'},body:JSON.stringify({requestId:id,accessToken:token,slugs:['one'],customer:buyer,accepted:true,expectedTotal:10795,policyVersion:null})});
 async function order({privateTest=false,id=crypto.randomUUID()}={}){
  const config=await (await commerceRoute(new Request('https://api.example.test/checkout/config'),env)).json();
  const req=request(id),input=await req.json();input.policyVersion=config.policyVersion;
  return (await createOrder(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(input)}),env,{test:privateTest})).json();
 }
 function settle(session){session.status='complete';session.payment_status='paid';session.payment_intent={id:'pi_fixture'+sessions.size,status:'succeeded',metadata:session.metadata,currency:'eur',amount:10795,amount_received:10795,latest_charge:{id:'ch_fixture',currency:'eur',amount:10795,amount_refunded:0,disputed:false}};}
 async function webhook(session,type='checkout.session.completed',{valid=true,live=session.livemode,object=session}={}){
  const payload=JSON.stringify({id:'evt_fixture',object:'event',type,livemode:live,data:{object}});
  const stripe=new Stripe('rk_test_fixture');
  const sig=stripe.webhooks.generateTestHeaderString({payload,secret:valid?signingSecret+(live?'-live':'-test'):'wrong-secret'});
  return commerceRoute(new Request('https://api.example.test/checkout/stripe-webhook',{method:'POST',headers:{'stripe-signature':sig},body:payload}),env);
 }
 return {db,env,settings,save,order,sessions,requests,mails,settle,webhook,uncertain:()=>uncertain=true,mismatch:()=>accountMismatch=true};
}
test.afterEach(()=>{globalThis.fetch=nativeFetch;});

test('Stripe sessions use server prices, dynamic methods, fixed EUR and an identical retry payload',async()=>{
 const f=setup(),id=crypto.randomUUID();const first=await f.order({id}),second=await f.order({id});
 assert.equal(first.checkoutUrl,second.checkoutUrl);assert.equal(first.provider,'stripe');assert.equal(f.sessions.size,1);
 const create=f.requests.find(r=>r.method==='POST'),body=new URLSearchParams(create.body);
 assert.equal(body.get('line_items[0][price_data][unit_amount]'),'10000');
 assert.equal(body.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'795');
 assert.equal(body.get('automatic_tax[enabled]'),'false');assert.equal(body.get('adaptive_pricing[enabled]'),'false');
 assert.equal([...body.keys()].some(k=>k.includes('payment_method_types')),false);
 assert.match(body.get('integration_identifier'),/^japansterdam_[a-z]{8}$/);
 assert.equal(create.headers.get('stripe-version'),'2026-09-30.endive');
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM stock_reservations').get().n,1);
});
test('signed paid webhooks fulfill without a return page, update delivery, send one receipt and reconcile refunds',async()=>{
 const f=setup(),order=await f.order(),session=[...f.sessions.values()][0];f.settle(session);
 await f.webhook(session);await f.webhook(session);
 assert.equal(JSON.parse(f.db.prepare("SELECT data FROM products WHERE slug='one'").get().data).sold,true);
 assert.equal(f.db.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status,'paid');
 assert.equal(JSON.parse(f.db.prepare('SELECT customer FROM orders WHERE id=?').get(order.id).customer).street,'Delivery street 2');
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM order_messages').get().n,2);
 session.payment_intent.latest_charge.amount_refunded=10795;
 await f.webhook(session,'charge.refunded',{object:{payment_intent:session.payment_intent.id}});
 assert.equal(f.db.prepare('SELECT refunded FROM orders WHERE id=?').get(order.id).refunded,10795);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM stock_reservations').get().n,1);
});
test('unpaid completion reserves stock until asynchronous success; asynchronous failure releases it',async()=>{
 const f=setup(),order=await f.order(),session=[...f.sessions.values()][0];
 session.status='complete';session.payment_intent={id:'pi_pending',currency:'eur',amount:10795,metadata:session.metadata,status:'processing'};
 await f.webhook(session);assert.equal(f.db.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status,'pending');
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM order_messages').get().n,0);
 f.settle(session);await f.webhook(session,'checkout.session.async_payment_succeeded');
 assert.equal(f.db.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status,'paid');
 const g=setup(),failed=await g.order(),pending=[...g.sessions.values()][0];
 pending.status='complete';pending.payment_intent={id:'pi_failed',currency:'eur',amount:10795,metadata:pending.metadata,status:'requires_payment_method'};
 await g.webhook(pending,'checkout.session.async_payment_failed');
 assert.equal(g.db.prepare('SELECT status FROM orders WHERE id=?').get(failed.id).status,'failed');
 assert.equal(g.db.prepare('SELECT count(*) AS n FROM stock_reservations').get().n,0);
});
test('bad signatures, wrong mode and mismatched settled amounts never sell stock',async()=>{
 const f=setup(),order=await f.order(),session=[...f.sessions.values()][0];f.settle(session);
 await assert.rejects(f.webhook(session,undefined,{valid:false}),/signature/);
 await f.webhook(session,undefined,{live:false});
 assert.equal(f.db.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status,'open');
 session.amount_total=1;await assert.rejects(f.webhook(session),/verification failed/);
 assert.equal(JSON.parse(f.db.prepare("SELECT data FROM products WHERE slug='one'").get().data).sold,false);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM stock_reservations').get().n,1);
});
test('ambiguous creation retains stock and retries the same Stripe idempotency key; only verified expiry frees stock',async()=>{
 const f=setup(),id=crypto.randomUUID();f.uncertain();await assert.rejects(f.order({id}));
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM stock_reservations').get().n,1);
 const order=await f.order({id});assert.equal(f.sessions.size,1);
 const attempts=f.requests.filter(r=>r.method==='POST');assert.equal(attempts[0].body,attempts[1].body);
 const session=[...f.sessions.values()][0];await syncOrder(f.env,order.id);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM stock_reservations').get().n,1);
 session.status='expired';await f.webhook(session,'checkout.session.expired');
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM stock_reservations').get().n,0);
});
test('sandbox tests cannot reserve live inventory or email buyers; tax and matching account remain gated',async()=>{
 const f=setup();const order=await f.order({privateTest:true}),session=[...f.sessions.values()][0];f.settle(session);await f.webhook(session);
 assert.equal(order.mode,'test');assert.equal(f.db.prepare('SELECT count(*) AS n FROM stock_reservations').get().n,0);
 assert.equal(JSON.parse(f.db.prepare("SELECT data FROM products WHERE slug='one'").get().data).sold,false);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM order_messages').get().n,0);
 assert.equal(readiness(f.env,{...f.settings,taxMode:'pending'}).ready,false);
 assert.equal(readiness({...f.env,STRIPE_LIVE_WEBHOOK_SECRET:''},f.settings).ready,false);
 const g=setup();g.mismatch();await assert.rejects(g.order(),/does not match/);
});
test('existing Stripe orders keep their provider after changing settings; disputes block shipping',async()=>{
 const f=setup(),order=await f.order(),session=[...f.sessions.values()][0];f.settle(session);f.save({...f.settings,provider:'mollie'});
 await f.webhook(session);session.payment_intent.latest_charge.disputed=true;
 await f.webhook(session,'charge.dispute.created',{object:{payment_intent:session.payment_intent.id}});
 assert.equal(f.db.prepare('SELECT chargeback FROM orders WHERE id=?').get(order.id).chargeback,10795);
 await assert.rejects(commerceRoute(new Request('https://api.example.test/admin/orders/'+order.id,{method:'POST',body:JSON.stringify({action:'ship'})}),f.env,null,{admin:true}),/Only a paid live order/);
});
