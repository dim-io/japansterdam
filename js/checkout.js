import { imageFrameStyle } from './image-frames.js';
import './layout.js?v=grailed-links';
import { getContent, getProducts, formatPrice, esc, productUrl } from './data.js';
import { getBag, removeFromBag, clearBag, onBagChange } from './bag.js';

const [c, all] = await Promise.all([getContent(), getProducts()]);
const root = document.getElementById('checkout-root');
const email = c.site.email;
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
  </section>
  <section class="co__form" aria-labelledby="form-h">
    <h2 id="form-h">Your details</h2>
    <form class="form" id="order-form" novalidate>
      <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" autocomplete="name" required></div>
      <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="f-street">Street and number</label><input id="f-street" name="street" autocomplete="address-line1" required></div>
      <div class="row">
        <div class="field"><label for="f-zip">Postal code</label><input id="f-zip" name="zip" autocomplete="postal-code" required></div>
        <div class="field"><label for="f-city">City</label><input id="f-city" name="city" autocomplete="address-level2" required></div>
      </div>
      <div class="field"><label for="f-country">Country</label><input id="f-country" name="country" autocomplete="country-name" required></div>
      <div class="field"><label for="f-note">Note (optional)</label><textarea id="f-note" name="note"></textarea></div>
      <p class="form__help">You'll receive the total including shipping and a payment link by email.</p>
      <p class="form__err" id="form-err" role="alert"></p>
      <button class="btn btn--primary btn--block" type="submit">Send order request</button>
    </form>
  </section>
</div>`;
  restore(keep);
  document.getElementById('order-form').addEventListener('submit', onSubmit);
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

function onSubmit(e) {
  e.preventDefault();
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
  const items = bagItems();
  const total = items.reduce((n, p) => n + p.price, 0);
  const lines = items.map((p, i) => `${i + 1}. ${p.name}\n   Brand: ${p.brand}\n   Size: ${p.size}\n   Price: ${formatPrice(p.price)}\n   ${new URL(productUrl(p.slug), location.href).href}`);
  const body = [
    'Hello Japansterdam,', '', "I'd like to order the following pieces:", '', lines.join('\n\n'), '',
    `Subtotal: ${formatPrice(total)} (excluding shipping)`, '',
    'Name: ' + v.name, 'Email: ' + v.email, '',
    'Shipping address:', v.street, `${v.zip} ${v.city}`, v.country, '',
    'Note: ' + (v.note || '-'),
  ].join('\n');
  const subject = 'Order request — ' + v.name;
  const href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body).replace(/%0A/g, '%0D%0A')}`;
  confirmed = true;
  root.innerHTML = `<div class="confirm"><h1 class="page-title">Thank you.</h1>
    <p>Your email app should now open with your order request. Press send to complete it. You'll receive the total including shipping and a payment link by email.</p>
    <p>If nothing opened, email <a class="u" href="${href}">${esc(email)}</a> and mention the pieces you want.</p>
    <a class="btn" href="shop.html">Continue shopping</a><button class="btn" type="button" id="empty-bag">Empty bag</button></div>`;
  document.getElementById('empty-bag').addEventListener('click', () => { clearBag(); confirmed = false; render(); });
  window.scrollTo(0, 0);
  window.location.href = href;
}

onBagChange(render);
render();
