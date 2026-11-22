import { checkoutFormHTML } from './checkout-form.js';
import { businessDetailsHTML } from './business-details.js';
import { API_BASE } from './config.js';
import { imageFrameStyle } from './image-frames.js';
import './layout.js?v=visitor-insights-3';
import { getContent, getProducts, esc, productUrl } from './data.js?v=visitor-insights-3';
import { getBag, setBag, onBagChange } from './bag.js?v=visitor-insights-3';

const formatPrice=n=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(Number(n));
const [c, all, paymentConfig] = await Promise.all([getContent(), getProducts(), fetch(API_BASE + '/checkout/config').then(r => r.ok ? r.json() : null).catch(() => null)]);
const root = document.getElementById('checkout-root');
const email = c.site.email;
// The notice shares the editable Shipping & Returns copy in both checkout modes.
const returnCosts = c.shipping?.sections?.find(section => section.heading?.trim().toLowerCase() === 'return shipping costs')?.body || '';
let confirmed = false;

const bagItems = () => getBag().map((s) => all.find((p) => p.slug === s)).filter((p) => p && !p.sold);

function render() {
  if (confirmed) return;
  const items = bagItems();
  if (!items.length) {
    root.innerHTML = `<div class="notfound"><h1 class="page-title">Your bag is empty</h1><p>Browse the collection and add a piece.</p><a class="btn btn--primary" href="shop.html">Shop</a></div>`;
    return;
  }
  const total = items.reduce((n, p) => n + p.price, 0);
  const keep = snapshot();
  root.innerHTML = `<h1 class="page-title" style="margin-bottom:40px">Checkout</h1>
<div class="co">
  <section class="co__summary" aria-labelledby="sum-h">
    <h2 id="sum-h">Your bag</h2>
    ${items.map((p) => `<div class="co-item">
      <a class="line-item__img" href="${productUrl(p.slug)}" tabindex="-1" aria-hidden="true"><img style="${imageFrameStyle(p, p.images[0])}" src="${esc(p.images[0])}" alt="" width="144" height="180"></a>
      <div><p class="line-item__brand">${esc(p.brand)}</p><a class="line-item__name" href="${productUrl(p.slug)}">${esc(p.name)}</a>
      <p class="line-item__meta">Size ${esc(p.size)}</p>
      <button class="line-item__remove" type="button" data-remove="${esc(p.slug)}" aria-label="Remove ${esc(p.name)}">Remove</button></div>
      <p class="line-item__meta">${formatPrice(p.price)}</p></div>`).join('')}
    <div class="co-total"><span>Subtotal</span><strong>${formatPrice(total)}</strong></div>
    ${paymentConfig?.enabled ? '<div class="co-total"><span>Shipping</span><strong id="shipping-total">Choose country</strong></div><div class="co-total"><span>Total</span><strong id="order-total">—</strong></div><p class="form__help">'+esc(paymentConfig.taxNote)+'</p>' : ''}
  </section>
  <section class="co__form" aria-labelledby="form-h">
    ${checkoutFormHTML(paymentConfig, {email, returnCosts})}
    ${businessDetailsHTML(paymentConfig || c.site.business, 'checkout-business-details')}
  </section>
</div>`;
  restore(keep);
  document.getElementById('order-form')?.addEventListener('submit', onSubmit);
  if(paymentConfig?.enabled){const country=document.getElementById('f-country');country.addEventListener('change',updateQuote);if(country.value)updateQuote();}
}

function snapshot() {
  const f = document.getElementById('order-form');
  return f ? Object.fromEntries(new FormData(f)) : {};
}
function restore(v) {
  for (const [k, val] of Object.entries(v)) {
    const el = document.querySelector(`#order-form [name="${k}"]`);
    if (el) el.value = val;
  }
}

async function onSubmit(e) {
  e.preventDefault();
  if (!paymentConfig?.enabled) return;
  const form = e.currentTarget;
  const err = document.getElementById('form-err');
  const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x).trim()]));
  const missing = ['name', 'email', 'street', 'zip', 'city', 'country'].filter((k) => !v[k]);
  form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  const bad = [...missing];
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) bad.push('email');
  if (bad.length) {
    bad.forEach((k) => form.elements[k].setAttribute('aria-invalid', 'true'));
    err.textContent = missing.length ? 'Please fill in all required fields.' : 'Please enter a valid email address.';
    form.elements[bad[0]].focus();
    return;
  }
  err.textContent = '';
  await startPayment(form,v,err);
}

onBagChange(()=>{if(!location.hash.startsWith('#order='))render();});
if(location.hash.startsWith('#order='))showPaymentStatus();else render();



const euro=cents=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100);
async function request(path,data){const r=await fetch(API_BASE+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const b=await r.json().catch(()=>({}));if(!r.ok)throw Error(b.error||'Could not reach checkout. Please try again.');return b;}
let quoteVersion=0,latestQuote=null;
async function updateQuote(){
 const version=++quoteVersion,country=document.getElementById('f-country').value;latestQuote=null;
 if(!country)return;
 try{const q=await request('/checkout/quote',{slugs:bagItems().map(p=>p.slug),country});if(version!==quoteVersion)return;latestQuote={...q,country};document.getElementById('shipping-total').textContent=euro(q.shipping);document.getElementById('order-total').textContent=euro(q.total);document.getElementById('form-err').textContent='';}
 catch(e){if(version===quoteVersion){document.getElementById('order-total').textContent='—';document.getElementById('form-err').textContent=e.message;}}
}
async function startPayment(form,v,err){
 if(!latestQuote||latestQuote.country!==v.country){err.textContent='Choose a shipping country and wait for the total before paying.';return;}
 if(!form.elements.accepted.checked){err.textContent='Please accept the purchase terms before paying.';return;}
 const btn=form.querySelector('[type=submit]');btn.disabled=true;btn.textContent='Opening secure payment…';
 try{
  const input={slugs:bagItems().map(p=>p.slug),customer:v,accepted:true,expectedTotal:latestQuote.total,policyVersion:paymentConfig.policyVersion};
  // Keep the same identifier and capability across network retries and the payment redirect.
  let pending;try{pending=JSON.parse(sessionStorage.getItem('jp_pending_checkout')||'null');}catch{}
  const signature=JSON.stringify(input);
  if(!pending||pending.signature!==signature)pending={requestId:crypto.randomUUID(),accessToken:[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join(''),signature};
  sessionStorage.setItem('jp_pending_checkout',JSON.stringify(pending));sessionStorage.setItem('jp_order_'+pending.requestId,pending.accessToken);
  const result=await request('/checkout/orders',{...input,requestId:pending.requestId,accessToken:pending.accessToken});
  if(result.status==='paid'){location.hash='order='+result.id;await showPaymentStatus();return;}
  if(!result.checkoutUrl){sessionStorage.removeItem('jp_pending_checkout');throw Error('This payment has ended. Please submit again to start a new checkout.');}
  location.assign(result.checkoutUrl);
 }catch(e){err.textContent=e.message;btn.disabled=false;btn.textContent='Order and pay';}
}
let pollCount=0;
async function showPaymentStatus(){
 confirmed=true;const id=location.hash.slice('#order='.length);let accessToken;
 try{accessToken=sessionStorage.getItem('jp_order_'+id);}catch{}
 if(!accessToken){root.innerHTML='<div class="confirm"><h1 class="page-title">Check your order</h1><p>Open this page in the browser used for payment, or check your confirmation email. Contact Japansterdam if you need help.</p><a class="btn" href="shop.html">Back to shop</a></div>';return;}
 try{
  const o=await request('/checkout/status',{id,accessToken});
  const paid=o.status==='paid',ended=['failed','canceled','expired'].includes(o.status);
  if(paid&&o.mode==='live'){setBag(getBag().filter(slug=>!o.items.some(p=>p.slug===slug)));sessionStorage.removeItem('jp_pending_checkout');}
  root.innerHTML=`<div class="confirm"><p class="eyebrow">${o.mode==='test'?'TEST PAYMENT — NO PURCHASE':'Japansterdam order'}</p><h1 class="page-title">${paid?'Payment received':ended?'Payment not completed':'Checking your payment'}</h1><p class="order-reference">JPN-${esc(o.id)}</p><p>${paid?(o.mode==='test'?'This is a test. No real piece has been sold.':'Thank you. Your order is confirmed. You will receive your order details by email.'):ended?'You have not completed this payment. Your pieces may be purchased again if still available.':'Your payment is not yet confirmed. Please do not place another order while it is being checked.'}</p><p>${o.items.map(p=>esc(p.brand+' '+p.name+' · '+p.size)).join('<br>')}</p><p>Total: ${euro(o.total)}</p>${o.tracking?`<p><a class="u" href="${esc(o.tracking)}" target="_blank" rel="noopener">Track shipment ↗</a></p>`:''}<a class="btn" href="shop.html">Continue shopping</a>${!paid&&!ended?'<button class="btn" id="check-payment">Check payment again</button>':''}${paid?'<p><a class="u" href="returns.html">Withdraw from this order</a></p>':''}</div>`;
  document.getElementById('check-payment')?.addEventListener('click',showPaymentStatus);
  if(!paid&&!ended&&pollCount++<10)setTimeout(()=>{if(location.hash==='#order='+id)showPaymentStatus();},5000);
 }catch(e){root.innerHTML=`<div class="confirm"><h1 class="page-title">Payment status unavailable</h1><p>${esc(e.message)} Please check your email or contact Japansterdam before paying again.</p><button class="btn" id="check-payment">Check again</button></div>`;document.getElementById('check-payment').onclick=showPaymentStatus;}
}
