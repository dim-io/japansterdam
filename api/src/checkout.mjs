// Hosted Mollie payments. Prices, stock and payment state are always server-owned.
export class CheckoutError extends Error { constructor(status,message){super(message);this.name='CheckoutError';this.status=status;} }
const fail=(status,message)=>{throw new CheckoutError(status,message);};
const sql=(env,q,...v)=>env.DB.prepare(q).bind(...v);
const now=()=>Date.now();
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[a-f0-9]{64}$/;
const PAYMENT=/^tr_[A-Za-z0-9]+$/;
const terminal=new Set(['canceled','expired','failed']);
const money=n=>(n/100).toFixed(2);
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function body(req){const text=await req.text();if(text.length>18000)fail(413,'Request too large');try{return JSON.parse(text);}catch{fail(400,'Invalid request');}}
const str=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
export function cleanSettings(input={}){
 const s={enabled:input.enabled===true,mode:input.mode==='live'?'live':'test',company:str(input.company),kvk:str(input.kvk,20),vat:str(input.vat,30),address:str(input.address,500),email:str(input.email),returnAddress:str(input.returnAddress,500),taxNote:str(input.taxNote,500),deliveryText:str(input.deliveryText,3000),returnsText:str(input.returnsText,5000),privacyText:str(input.privacyText,5000),termsText:str(input.termsText,5000),reviewed:input.reviewed===true,shipping:[],methods:[]};
 for(const r of Array.isArray(input.shipping)?input.shipping.slice(0,80):[]){
  const country=str(r.country,2).toUpperCase(),cents=Number(r.cents);
  if(!/^[A-Z]{2}$/.test(country)||!Number.isInteger(cents)||cents<0||cents>100000||s.shipping.some(x=>x.country===country))fail(400,'Use unique two-letter country codes and valid shipping prices.');
  try {if(new Intl.DisplayNames(['en'],{type:'region'}).of(country)===country)fail(400,'Unknown country code');}catch{fail(400,'Unknown country code');}
  s.shipping.push({country,cents});
 }
 s.methods=[...new Set((Array.isArray(input.methods)?input.methods: ['ideal','creditcard']).filter(m=>['ideal','creditcard','bancontact'].includes(m)))];
 return s;
}
export async function settings(env){const row=await sql(env,"SELECT data FROM commerce_settings WHERE id='main'").first();return cleanSettings(row?JSON.parse(row.data):{});}
function credentials(env,mode){return new RegExp('^'+mode+'_[A-Za-z0-9]+$').test(env.MOLLIE_API_KEY||'');}
export function readiness(env,s){
 const missing=[];
 for(const k of ['company','kvk','address','email','returnAddress','taxNote','deliveryText','returnsText','privacyText','termsText'])if(!s[k])missing.push(k);
 if(!/^\d{8}$/.test(s.kvk))missing.push('valid_kvk');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email))missing.push('valid_email');
 if(!s.shipping.length)missing.push('shipping');if(!s.methods.length)missing.push('payment_methods');if(!s.reviewed)missing.push('legal_review');
 if(!credentials(env,s.mode))missing.push('MOLLIE_API_KEY ('+s.mode+')');
 if(s.mode==='live'&&(!env.RESEND_API_KEY||!env.ORDER_EMAIL_FROM))missing.push('verified_confirmation_email');
 return {ready:missing.length===0,missing};
}
async function mollie(env,mode,path,options={}){
 if(!credentials(env,mode))fail(503,'Payment account is not configured for this mode.');
 const r=await fetch('https://api.mollie.com/v2'+path,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.MOLLIE_API_KEY,'Content-Type':'application/json',...options.headers}});
 if(!r.ok){const e=new CheckoutError(502,'The payment provider could not complete this request.');e.definitive=r.status>=400&&r.status<500&&r.status!==408&&r.status!==409&&r.status!==429;throw e;}
 return r.json();
}
const rowById=(env,id)=>sql(env,'SELECT * FROM orders WHERE id=?',id).first();
function publicOrder(o){return {id:o.id,number:'JPN-'+o.id,mode:o.mode,status:o.status,items:JSON.parse(o.items),subtotal:o.subtotal,shipping:o.shipping,total:o.total,fulfillment:o.fulfillment,tracking:o.tracking,refunded:o.refunded,chargeback:o.chargeback,checkoutUrl:['open','pending','authorized'].includes(o.status)?o.checkout_url:null};}
export function customer(input){
 const c={};for(const k of ['name','email','street','zip','city','country','note'])c[k]=str(input?.[k],k==='note'?1000:200);
 c.email=c.email.toLowerCase();c.country=c.country.toUpperCase();
 if(['name','street','zip','city'].some(k=>!c[k])||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)||!/^[A-Z]{2}$/.test(c.country))fail(400,'Please enter your name, email and complete shipping address.');
 return c;
}
async function rateLimit(req,env){
 const slot=Math.floor(now()/900000),ip=req.headers.get('CF-Connecting-IP')||'unknown',bucket=slot+':'+await hash(ip);
 const r=await sql(env,'INSERT INTO commerce_rate_limits(bucket,attempts) VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts',bucket).first();
 if(r.attempts>8)fail(429,'Too many requests. Please try again later.');
}
export async function quote(env,slugs,country,s=undefined){
 s ||= await settings(env);
 if(!Array.isArray(slugs)||!slugs.length||slugs.length>10||slugs.some(x=>typeof x!=='string'||x.length>250)||new Set(slugs).size!==slugs.length)fail(400,'Choose between 1 and 10 unique pieces.');
 const shipping=s.shipping.find(r=>r.country===country);if(!shipping)fail(400,'Online shipping is not available for this country. Please contact us.');
 const items=[];
 for(const slug of slugs){const row=await sql(env,'SELECT data FROM products WHERE slug=?',slug).first();const p=row&&JSON.parse(row.data);
  if(!p||p.active===false||p.sold===true)fail(409,'One of these pieces is no longer available.');
  const cents=Math.round(Number(p.price)*100);if(!Number.isFinite(cents)||cents<=0||cents>10000000)fail(409,'This piece cannot be purchased online.');
  items.push({slug:p.slug,name:p.name,brand:p.brand,size:p.size,condition:p.condition,conditionNotes:p.conditionNotes,cents,image:p.images?.[0]||''});
 }
 const subtotal=items.reduce((n,p)=>n+p.cents,0);return {items,subtotal,shipping:shipping.cents,total:subtotal+shipping.cents,currency:'EUR'};
}
async function createPayment(env,o){
 // Same stored body and key on ambiguous retries; never create a second payment for the order.
 if(o.payment_id)return o;
 if(now()-o.created_at>50*60000)fail(409,'Payment setup needs a manual check. Please contact Japansterdam.');
 try{
  const p=await mollie(env,o.mode,'/payments',{method:'POST',headers:{'Idempotency-Key':o.id},body:o.payment_request});
  const link=p._links?.checkout?.href;let u;try{u=new URL(link);}catch{fail(502,'Missing payment link');}
  if(!PAYMENT.test(p.id||'')||u.protocol!=='https:'||!(u.hostname==='mollie.com'||u.hostname.endsWith('.mollie.com'))||p.mode!==o.mode)fail(502,'Invalid payment response');
  await sql(env,"UPDATE orders SET payment_id=?,checkout_url=?,status='open',updated_at=?,setup_error=NULL WHERE id=? AND payment_id IS NULL",p.id,link,now(),o.id).run();
 }catch(e){
  if(e.definitive)await env.DB.batch([sql(env,"UPDATE orders SET status='failed',setup_error='provider_rejected',updated_at=? WHERE id=? AND payment_id IS NULL",now(),o.id),sql(env,'DELETE FROM stock_reservations WHERE order_id=?',o.id)]);
  else await sql(env,"UPDATE orders SET setup_error='unconfirmed',updated_at=? WHERE id=?",now(),o.id).run();
  throw e;
 }
 return rowById(env,o.id);
}
export async function createOrder(req,env,{test=false}={}){
 const s=await settings(env);if(!test&&(!s.enabled||s.mode!=='live'||!readiness(env,s).ready))fail(503,'Direct payment is not available yet.');
 const mode=test?'test':'live';if(!credentials(env,mode))fail(503,'Add the matching Mollie API key first.');
 const b=await body(req),c=customer(b.customer);
 if(!ID.test(b.requestId||'')||!TOKEN.test(b.accessToken||''))fail(400,'Invalid checkout identifier');
 if(!test&&b.accepted!==true)fail(400,'Please accept the purchase terms.');
 const accessHash=await hash(b.accessToken),requestHash=await hash(JSON.stringify({slugs:b.slugs,customer:c,accepted:b.accepted===true,mode}));
 let o=await rowById(env,b.requestId);
 if(o){if(o.access_hash!==accessHash||o.request_hash!==requestHash)fail(409,'This checkout identifier is already in use.');if(o.status==='creating')o=await createPayment(env,o);return response(publicOrder(o));}
 await rateLimit(req,env);
 // Reconcile a few existing locks, but never release them on a local timer or provider outage.
 if(!test){const locks=await env.DB.prepare("SELECT DISTINCT o.id FROM orders o JOIN stock_reservations r ON r.order_id=o.id WHERE o.status IN ('open','pending','authorized') ORDER BY o.updated_at LIMIT 4").all();for(const row of locks.results)await syncOrder(env,row.id).catch(()=>{});}
 const q=await quote(env,b.slugs,c.country,s),id=b.requestId,time=now();
 if(!test&&(b.expectedTotal!==q.total||b.policyVersion!==await hash(JSON.stringify(s))))fail(409,'Prices or purchase information changed. Refresh checkout and review the total before paying.');
 const origin=req.headers.get('Origin');
 const site=['https://japansterdam.com','https://www.japansterdam.com','https://dim-io.github.io'].includes(origin)?origin+(origin==='https://dim-io.github.io'?'/japansterdam':''):'https://japansterdam.com';
 const payload=JSON.stringify({amount:{currency:'EUR',value:money(q.total)},description:'Japansterdam JPN-'+id,redirectUrl:site+'/checkout.html#order='+id,webhookUrl:new URL('/checkout/webhook',req.url).href,method:s.methods,metadata:{order_id:id}});
 const statements=[sql(env,"INSERT INTO orders(id,access_hash,request_hash,mode,status,customer,items,policy,subtotal,shipping,total,payment_request,created_at,updated_at) VALUES (?,?,?,?,'creating',?,?,?,?,?,?,?,?,?)",id,accessHash,requestHash,mode,JSON.stringify(c),JSON.stringify(q.items),JSON.stringify(s),q.subtotal,q.shipping,q.total,payload,time,time)];
 if(!test)for(const item of q.items)statements.push(sql(env,'INSERT INTO stock_reservations(slug,order_id,expected_cents) VALUES (?,?,?)',item.slug,id,item.cents));
 try{await env.DB.batch(statements);}catch{const previous=await rowById(env,id);if(previous&&previous.access_hash===accessHash&&previous.request_hash===requestHash)return response(publicOrder(await createPayment(env,previous)));fail(409,'A piece was just reserved by another customer. Refresh your bag and try again.');}
 o=await createPayment(env,await rowById(env,id));return response(publicOrder(o),201);
}
async function enqueue(env,o,kind,to,subject,text){
 if(o.mode!=='live')return;
 await sql(env,"INSERT OR IGNORE INTO order_messages(order_id,kind,payload,created_at) VALUES (?,?,?,?)",o.id,kind,JSON.stringify({from:env.ORDER_EMAIL_FROM,to:[to],subject,text}),now()).run();
}
function receipt(o){const s=JSON.parse(o.policy),c=JSON.parse(o.customer);return ['Japansterdam — order JPN-'+o.id,'Payment received. Thank you, '+c.name+'.','',...JSON.parse(o.items).map(p=>`${p.brand} ${p.name} / Size ${p.size} / €${money(p.cents)}\nCondition: ${p.condition}. ${p.conditionNotes||''}`),'',`Subtotal: €${money(o.subtotal)}`,`Shipping: €${money(o.shipping)}`,`Total paid: €${money(o.total)}`,s.taxNote,'',c.name,c.street,c.zip+' '+c.city,c.country,'',s.company,s.address,'KvK '+s.kvk,s.vat?'VAT ID '+s.vat:'',s.email,'',s.deliveryText,'',s.termsText,'',s.returnsText,'Return address: '+s.returnAddress,'Withdraw online: https://japansterdam.com/returns.html','',s.privacyText].join('\n');}
async function queuePaidMail(env,o){
 const s=JSON.parse(o.policy),c=JSON.parse(o.customer);
 await enqueue(env,o,'receipt',c.email,'Your Japansterdam order — JPN-'+o.id,receipt(o));
 await enqueue(env,o,'owner',s.email,'Paid Japansterdam order — JPN-'+o.id,receipt(o));
}
export async function syncOrder(env,id){
 let o=await rowById(env,id);if(!o||!o.payment_id)return o;
 const p=await mollie(env,o.mode,'/payments/'+o.payment_id);
 if(p.id!==o.payment_id||p.metadata?.order_id!==o.id||p.mode!==o.mode||p.amount?.currency!=='EUR'||p.amount?.value!==money(o.total))fail(502,'Payment verification failed.');
 if(!['open','pending','authorized','paid','canceled','expired','failed'].includes(p.status))fail(502,'Unrecognized payment status');
 const refunded=p.amountRefunded?.currency==='EUR'?Math.round(Number(p.amountRefunded.value)*100)||0:0;
 const chargeback=p.amountChargedBack?.currency==='EUR'?Math.round(Number(p.amountChargedBack.value)*100)||0:0;
 if(p.status==='paid'){
  const batch=[];
  if(o.mode==='live'){
   // An older paid webhook must never modify inventory belonging to another order.
   for(const item of JSON.parse(o.items))batch.push(sql(env,"UPDATE products SET data=json_set(data,'$.sold',json('true')),updated_at=? WHERE slug=? AND EXISTS(SELECT 1 FROM stock_reservations WHERE slug=? AND order_id=?)",now(),item.slug,item.slug,id));
  }
  batch.push(sql(env,"UPDATE orders SET status='paid',paid_at=COALESCE(paid_at,?),updated_at=?,last_sync_at=?,refunded=?,chargeback=? WHERE id=?",now(),now(),now(),refunded,chargeback,id));
  await env.DB.batch([batch.pop(),...batch]);o=await rowById(env,id);await queuePaidMail(env,o);
 }else if(terminal.has(p.status)){
  // Never downgrade a paid order because an earlier API response arrives late.
  await env.DB.batch([sql(env,"UPDATE orders SET status=?,updated_at=?,last_sync_at=? WHERE id=? AND status!='paid'",p.status,now(),now(),id),sql(env,"DELETE FROM stock_reservations WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status IN ('canceled','expired','failed'))",id,id)]);
 }else await sql(env,"UPDATE orders SET status=?,updated_at=?,last_sync_at=? WHERE id=? AND status NOT IN ('paid','canceled','expired','failed')",p.status,now(),now(),id).run();
 return rowById(env,id);
}
export async function sendMessages(env){
 if(!env.RESEND_API_KEY||!env.ORDER_EMAIL_FROM)return;
 const rows=await env.DB.prepare("SELECT * FROM order_messages WHERE state='queued' AND attempts<5 ORDER BY created_at LIMIT 4").all();
 for(const m of rows.results){
  if(now()-m.created_at>23*3600000){await sql(env,"UPDATE order_messages SET state='needs_review' WHERE order_id=? AND kind=?",m.order_id,m.kind).run();continue;}
  const claim=await sql(env,"UPDATE order_messages SET attempts=attempts+1,last_attempt_at=? WHERE order_id=? AND kind=? AND state='queued' AND (last_attempt_at IS NULL OR last_attempt_at<?)",now(),m.order_id,m.kind,now()-60000).run();if(!claim.meta.changes)continue;
  try{const r=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':m.order_id+'-'+m.kind},body:m.payload});if(r.ok)await sql(env,"UPDATE order_messages SET state='sent',sent_at=? WHERE order_id=? AND kind=?",now(),m.order_id,m.kind).run();}catch{/* Stable key/payload allow a bounded retry without duplicate receipts. */}
 }
}
export async function reconcile(env){
 const rows=await env.DB.prepare("SELECT id,status FROM orders WHERE status IN ('creating','open','pending','authorized') ORDER BY COALESCE(last_sync_at,0),created_at LIMIT 4").all();
 for(const r of rows.results){await sql(env,'UPDATE orders SET last_sync_at=? WHERE id=?',now(),r.id).run();try{if(r.status==='creating'){const o=await rowById(env,r.id);if(now()-o.created_at<50*60000)await createPayment(env,o);}else await syncOrder(env,r.id);}catch{/* Keep uncertain stock reserved for review. */}}
 await sendMessages(env);
 await sql(env,'DELETE FROM commerce_rate_limits WHERE CAST(substr(bucket,1,instr(bucket,\':\')-1) AS INTEGER)<?',Math.floor(now()/900000)-8).run();
}
export async function guardProduct(env,slug,input){
 const r=await sql(env,'SELECT o.status FROM orders o JOIN stock_reservations r ON o.id=r.order_id WHERE r.slug=?',slug).first();
 if(!r)return;
 if(input===null||r.status!=='paid'||input.sold!==true)fail(409,'This piece belongs to a checkout or paid order. Manage that order first.');
}
export async function commerceRoute(req,env,ctx,{admin=false}={}){
 const u=new URL(req.url),path=u.pathname.replace(/\/$/,''),method=req.method;
 if(admin){
  if(path==='/admin/checkout'&&method==='GET'){const s=await settings(env);return response({settings:s,...readiness(env,s),keyMode:env.MOLLIE_API_KEY?.startsWith('live_')?'live':env.MOLLIE_API_KEY?.startsWith('test_')?'test':'missing',emailConfigured:!!(env.RESEND_API_KEY&&env.ORDER_EMAIL_FROM)});}
  if(path==='/admin/checkout'&&method==='PUT'){
   const s=cleanSettings(await body(req));if(s.enabled&&(s.mode!=='live'||!readiness(env,s).ready))fail(400,'Finish setup before enabling live checkout: '+readiness(env,s).missing.join(', '));
   await sql(env,"INSERT INTO commerce_settings(id,data,updated_at) VALUES ('main',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",JSON.stringify(s),now()).run();return response({settings:s,...readiness(env,s)});
  }
  if(path==='/admin/checkout/test'&&method==='POST')return createOrder(req,env,{test:true});
  if(path==='/admin/checkout/email-test'&&method==='POST'){
   const s=await settings(env);if(!env.RESEND_API_KEY||!env.ORDER_EMAIL_FROM||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email))fail(400,'Configure the verified sender and save your contact email first.');
   const r=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'owner-email-test-'+Math.floor(now()/60000)},body:JSON.stringify({from:env.ORDER_EMAIL_FROM,to:[s.email],subject:'Japansterdam checkout — email test',text:'Your Japansterdam checkout confirmation email connection is working. This is a test, not an order.'})});
   if(!r.ok)fail(502,'Email provider did not accept the test. Check your sending domain and credentials.');return response({ok:true});
  }

  if(path==='/admin/orders'&&method==='GET'){const rows=await env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100').all();const messages=await env.DB.prepare('SELECT order_id,kind,state,attempts FROM order_messages').all();const withdrawals=await env.DB.prepare('SELECT * FROM withdrawals').all();return response(rows.results.map(o=>({...publicOrder(o),customer:JSON.parse(o.customer),createdAt:o.created_at,setupError:o.setup_error,messages:messages.results.filter(m=>m.order_id===o.id),withdrawal:withdrawals.results.find(w=>w.order_id===o.id)||null})));}
  if(path.startsWith('/admin/orders/')&&method==='POST'){
   const id=path.slice('/admin/orders/'.length);if(!ID.test(id))fail(404,'Order not found');const b=await body(req);let o=await rowById(env,id);if(!o)fail(404,'Order not found');
   if(b.action==='sync'){if(o.status==='creating')o=await createPayment(env,o);else o=await syncOrder(env,id);await sendMessages(env);return response(publicOrder(o));}
   if(b.action==='release-returned'){
    o=await syncOrder(env,id);if(o.mode!=='live'||o.refunded<o.total||b.confirmed!==true)fail(409,'Confirm the returned pieces are received and the full refund is verified first.');
    await env.DB.batch([sql(env,"UPDATE orders SET fulfillment='returned',updated_at=? WHERE id=?",now(),id),sql(env,'DELETE FROM stock_reservations WHERE order_id=?',id)]);return response({ok:true});
   }
   if(b.action==='ship'){o=await syncOrder(env,id);if(await sql(env,'SELECT 1 FROM withdrawals WHERE order_id=?',id).first())fail(409,'Review the withdrawal request before shipping.');if(o.status!=='paid'||o.mode!=='live'||o.refunded||o.chargeback)fail(409,'Only a paid live order can be shipped.');const tracking=str(b.tracking,500);if(tracking){let link;try{link=new URL(tracking);}catch{fail(400,'Use a full https tracking link');}if(link.protocol!=='https:')fail(400,'Use a full https tracking link');}await sql(env,"UPDATE orders SET fulfillment='shipped',tracking=?,updated_at=? WHERE id=?",tracking,now(),id).run();return response({ok:true});}
   fail(400,'Unknown action');
  }
  return null;
 }
 if(path==='/checkout/config'&&method==='GET'){const s=await settings(env);return response({enabled:s.enabled&&s.mode==='live'&&readiness(env,s).ready,policyVersion:await hash(JSON.stringify(s)),shipping:s.shipping,company:s.company,kvk:s.kvk,vat:s.vat,address:s.address,email:s.email,returnAddress:s.returnAddress,taxNote:s.taxNote,deliveryText:s.deliveryText,returnsText:s.returnsText,privacyText:s.privacyText,termsText:s.termsText});}
 if(path==='/checkout/quote'&&method==='POST'){const s=await settings(env);if(!s.enabled||!readiness(env,s).ready)fail(503,'Direct payment is not available yet.');const b=await body(req);return response(await quote(env,b.slugs,str(b.country,2).toUpperCase(),s));}
 if(path==='/checkout/orders'&&method==='POST')return createOrder(req,env);
 if(path==='/checkout/status'&&method==='POST'){
  const b=await body(req);if(!ID.test(b.id||'')||!TOKEN.test(b.accessToken||''))fail(404,'Order not found');let o=await rowById(env,b.id);if(!o||o.access_hash!==await hash(b.accessToken))fail(404,'Order not found');
  if(o.payment_id&&now()-(o.last_sync_at||0)>10000)o=await syncOrder(env,o.id);ctx?.waitUntil?.(sendMessages(env));return response(publicOrder(o));
 }
 if(path==='/checkout/webhook'&&method==='POST'){
  const text=await req.text();if(text.length>1000)fail(413,'Request too large');const id=new URLSearchParams(text).get('id');if(!PAYMENT.test(id||''))fail(400,'Invalid payment id');const o=await sql(env,'SELECT id FROM orders WHERE payment_id=?',id).first();if(o){await syncOrder(env,o.id);ctx?.waitUntil?.(sendMessages(env));}return new Response('OK');
 }
 if(path==='/checkout/withdraw'&&method==='POST'){
  await rateLimit(req,env);const b=await body(req),id=str(b.orderNumber,60).replace(/^JPN-/i,''),email=str(b.email).toLowerCase();
  if(!ID.test(id)||!email.includes('@')||b.confirmed!==true)fail(400,'Enter the full order number and your order email, then confirm withdrawal.');
  const o=await rowById(env,id);
  if(o&&o.mode==='live'&&o.status==='paid'&&JSON.parse(o.customer).email===email){
   const requested=now(),note=str(b.note,1000);
   await sql(env,'INSERT OR IGNORE INTO withdrawals(order_id,requested_at,note) VALUES (?,?,?)',id,requested,note).run();
   const w=await sql(env,'SELECT * FROM withdrawals WHERE order_id=?',id).first(),s=JSON.parse(o.policy);
   const text=`Withdrawal received for JPN-${id}\nRequested at: ${new Date(w.requested_at).toISOString()}\n${w.note}\n\nReturn address: ${s.returnAddress}\n${s.returnsText}\nContact: ${s.email}`;
   await enqueue(env,o,'withdrawal',email,'Japansterdam — withdrawal received',text);await enqueue(env,o,'withdrawal-owner',s.email,'Japansterdam — withdrawal request',text);await sendMessages(env);
  }
  return response({ok:true,message:'If these details match a paid order, we have recorded your withdrawal and will send an acknowledgement. If no email arrives, contact Japansterdam directly.'});
 }
 return null;
}
