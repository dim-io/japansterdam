import { imageFrameStyle } from './image-frames.js';
// Header, footer, mobile menu and bag drawer: the single source for shared chrome.
import { getContent, getProducts, formatPrice, esc, productUrl } from './data.js';
import { getBag, bagCount, removeFromBag, setBag, onBagChange } from './bag.js';

import { renderChrome } from './chrome.js?v=checkout-1';
const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
const { headerHTML, footerHTML, navLinks, ICON_CLOSE, site } = renderChrome(page);

// ---- mount ----
const header = document.getElementById('site-header');
const footer = document.getElementById('site-footer');
if (header) { header.className = 'site-header'; if (!header.querySelector('.hdr')) header.innerHTML = headerHTML(); }
if (footer) { footer.className = 'site-footer'; if (!footer.querySelector('.ft')) footer.innerHTML = footerHTML(); }

const menu = document.createElement('div');
menu.className = 'menu';
menu.id = 'menu';
menu.setAttribute('role', 'dialog');
menu.setAttribute('aria-modal', 'true');
menu.setAttribute('aria-label', 'Menu');
menu.innerHTML = `<div class="menu__top"><button class="icon-btn" type="button" aria-label="Close menu" data-close-menu>${ICON_CLOSE}</button></div>
<nav class="menu__links" aria-label="Mobile">${navLinks()}</nav>
<div class="menu__legal"><a href="${esc(site.instagram)}" data-site="instagram" target="_blank" rel="noopener">Instagram</a><a href="${esc(site.grailed)}" data-site="grailed" target="_blank" rel="noopener">Grailed ↗</a><a href="faq.html">FAQs</a><a href="shipping-returns.html">Shipping</a></div>`;

const overlay = document.createElement('div');
overlay.className = 'overlay';
overlay.setAttribute('data-overlay', '');

const drawer = document.createElement('aside');
drawer.className = 'drawer';
drawer.id = 'bag-drawer';
drawer.setAttribute('role', 'dialog');
drawer.setAttribute('aria-modal', 'true');
drawer.setAttribute('aria-label', 'Your bag');
drawer.innerHTML = `<div class="drawer__head"><h2 class="drawer__title">Your bag</h2><button class="icon-btn" type="button" aria-label="Close bag" data-close-bag>${ICON_CLOSE}</button></div>
<div class="drawer__body" data-drawer-body></div><div class="drawer__foot" data-drawer-foot></div>`;
document.body.append(menu, overlay, drawer);

// ---- focus trap ----
const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
let active = null, lastFocus = null;
function openLayer(el, focusSel) {
  closeLayer(true);
  lastFocus = document.activeElement;
  active = el;
  el.classList.add('is-open');
  if (el === drawer) overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  (el.querySelector(focusSel) || el.querySelector(FOCUSABLE))?.focus();
}
function closeLayer(silent) {
  if (!active) return;
  active.classList.remove('is-open');
  overlay.classList.remove('is-open');
  document.body.style.overflow = '';
  const burger = document.querySelector('[data-open-menu]');
  if (burger) burger.setAttribute('aria-expanded', 'false');
  active = null;
  if (!silent && lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
document.addEventListener('keydown', (e) => {
  if (!active) return;
  if (e.key === 'Escape') { closeLayer(); return; }
  if (e.key !== 'Tab') return;
  const f = [...active.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

export function openBag() { renderDrawer(); openLayer(drawer, '[data-close-bag]'); }
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-open-bag],[data-close-bag],[data-open-menu],[data-close-menu],[data-overlay],.menu__links a,[data-remove]');
  if (!t) return;
  if (t.matches('[data-open-bag]')) openBag();
  else if (t.matches('[data-close-bag],[data-overlay]')) closeLayer();
  else if (t.matches('[data-open-menu]')) { t.setAttribute('aria-expanded', 'true'); openLayer(menu, '[data-close-menu]'); }
  else if (t.matches('[data-close-menu]')) closeLayer();
  else if (t.matches('.menu__links a')) closeLayer(true);
  else if (t.matches('[data-remove]')) removeFromBag(t.dataset.remove);
});
window.addEventListener('jp:openbag', openBag);

// header border after scroll; compact header past 120px (with hysteresis so it never flickers)
const onScroll = () => {
  if (!header) return;
  const y = window.scrollY;
  header.classList.toggle('is-scrolled', y > 4);
  if (y > 120) header.classList.add('is-compact');
  else if (y < 90) header.classList.remove('is-compact');
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// fill data-dependent bits once content.json has loaded
getContent().then((c) => {
  const s = c.site || {};
  document.querySelectorAll('[data-site]').forEach((a) => { if (s[a.dataset.site]) a.href = s[a.dataset.site]; });
}).catch(() => {});

// ---- bag ----
async function renderDrawer() {
  const body = drawer.querySelector('[data-drawer-body]');
  const foot = drawer.querySelector('[data-drawer-foot]');
  const slugs = getBag();
  if (!slugs.length) {
    body.innerHTML = '<p class="drawer__empty">Your bag is empty.</p>';
    foot.innerHTML = '<a class="btn btn--block" href="shop.html">Continue shopping</a>';
    return;
  }
  const all = await getProducts().catch(() => []);
  const items = slugs.map((s) => all.find((p) => p.slug === s)).filter((p) => p && !p.sold);
  if (items.length !== slugs.length && all.length) { setBag(items.map((p) => p.slug)); return; }
  const total = items.reduce((n, p) => n + p.price, 0);
  body.innerHTML = items.map((p) => `<div class="line-item">
    <a class="line-item__img" href="${productUrl(p.slug)}" tabindex="-1" aria-hidden="true"><img style="${imageFrameStyle(p, p.images[0])}" src="${esc(p.images[0])}" alt="" width="144" height="180"></a>
    <div><p class="line-item__brand">${esc(p.brand)}</p>
    <a class="line-item__name" href="${productUrl(p.slug)}">${esc(p.name)}</a>
    <p class="line-item__meta">Size ${esc(p.size)} · ${formatPrice(p.price)}</p>
    <button class="line-item__remove" type="button" data-remove="${esc(p.slug)}" aria-label="Remove ${esc(p.name)}">Remove</button></div></div>`).join('');
  foot.innerHTML = `<div class="subtotal"><span>Subtotal</span><strong>${formatPrice(total)}</strong></div>
    <p class="drawer__note">Shipping is calculated after you send your order request.</p>
    <a class="btn btn--primary btn--block" href="checkout.html">Checkout</a>`;
}

let prevCount = bagCount();
function updateCount() {
  const n = bagCount();
  const added = n > prevCount;
  prevCount = n;
  document.querySelectorAll('[data-bag-count]').forEach((el) => {
    el.textContent = n; el.hidden = n === 0;
    if (added) {
      el.classList.remove('is-pulse');
      void el.offsetWidth;
      el.classList.add('is-pulse');
    }
  });
  const btn = document.querySelector('[data-open-bag]');
  if (btn) btn.setAttribute('aria-label', n ? `Open bag, ${n} item${n > 1 ? 's' : ''}` : 'Open bag');
}
onBagChange(() => { updateCount(); if (active === drawer) renderDrawer(); });
updateCount();
