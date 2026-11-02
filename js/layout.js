// Header, footer, mobile menu and bag drawer: the single source for shared chrome.
import { getContent, getProducts, formatPrice, esc, productUrl } from './data.js';
import { getBag, bagCount, removeFromBag, setBag, onBagChange } from './bag.js';

// Static defaults so the chrome renders at once; content.json refines them later (data-site hooks).
const site = {
  instagram: 'https://www.instagram.com/japansterdam',
  grailed: 'https://www.grailed.com/Japansterdam',
  substack: 'https://substack.com/japansterdam',
};
const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

const ICON_INSTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".8" fill="currentColor" stroke="none"/></svg>';
const ICON_BAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>';

const NAV = [['Shop', 'shop.html'], ['About', 'about.html'], ['Contact', 'contact.html']];
const current = (href) => (page === href || (page === 'product.html' && href === 'shop.html') ? ' aria-current="page"' : '');
const navLinks = (cls = '') => NAV.map(([l, h]) => `<a href="${h}"${current(h)}>${l}</a>`).join('');

function headerHTML() {
  return `<div class="hdr">
  <div class="hdr__left">
    <button class="icon-btn hdr__burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="menu" data-open-menu>${ICON_MENU}</button>
    <nav class="hdr__nav" aria-label="Primary">${navLinks()}</nav>
  </div>
  <a class="hdr__logo" href="index.html" aria-label="Japansterdam, home"><img src="assets/img/site/header-logo.png" alt="Japansterdam" width="702" height="104"></a>
  <div class="hdr__tools">
    <a class="icon-btn hdr__insta" href="${esc(site.instagram)}" data-site="instagram" target="_blank" rel="noopener" aria-label="Instagram">${ICON_INSTA}</a>
    <a class="icon-btn hdr__grailed" href="${esc(site.grailed)}" data-site="grailed" target="_blank" rel="noopener" aria-label="Shop Japansterdam on Grailed" title="Shop Japansterdam on Grailed"><img src="assets/icons/grailed.png" width="22" height="22" alt=""></a>
    <button class="icon-btn" type="button" aria-label="Open bag" data-open-bag>${ICON_BAG}<span class="bag-count" data-bag-count hidden>0</span></button>
  </div>
</div>`;
}

function footerHTML() {
  const ext = (key, label) => `<a class="ft-link" href="${esc(site[key])}" data-site="${key}" target="_blank" rel="noopener">${label}</a>`;
  return `<div class="ft">
  <div class="ft__top">
    <div class="ft__brand"><a href="index.html" aria-label="Japansterdam, home"><img src="assets/img/site/footer-logo.jpg" alt="Japansterdam" width="1535" height="1024" loading="lazy"></a></div>
    <div class="ft__col"><h2>Help</h2><ul>
      <li><a class="ft-link" href="shipping-returns.html">Shipping &amp; Returns</a></li>
      <li><a class="ft-link" href="size-guide.html">Size Guide</a></li>
      <li><a class="ft-link" href="faq.html">FAQs</a></li></ul></div>
    <div class="ft__col"><h2>Company</h2><ul>
      <li><a class="ft-link" href="about.html">About</a></li>
      <li><a class="ft-link" href="contact.html">Contact</a></li>
      <li><a class="ft-link" href="privacy-policy.html">Privacy Policy</a></li></ul></div>
    <div class="ft__col"><h2>Follow</h2><ul>
      <li>${ext('instagram', 'Instagram')}</li>
      <li>${ext('grailed', 'Visit our Grailed shop ↗')}</li>
      <li>${ext('substack', 'Substack')}</li></ul></div>
  </div>
  <div class="ft__news">
    <p>Sign up to receive news and updates.</p>
    <a class="btn btn--light" href="${esc(site.substack)}" data-site="substack" target="_blank" rel="noopener">Subscribe on Substack</a>
  </div>
  <p class="ft__bottom">© 2026 Japansterdam · Amsterdam</p>
</div>`;
}

// ---- mount ----
const header = document.getElementById('site-header');
const footer = document.getElementById('site-footer');
if (header) { header.className = 'site-header'; header.innerHTML = headerHTML(); }
if (footer) { footer.className = 'site-footer'; footer.innerHTML = footerHTML(); }

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

// Image reveal: fade in 300ms only after load; images already complete show at once.
function reveal(img) {
  if (img.classList.contains('is-loaded')) return;
  const show = () => img.classList.add('is-loaded');
  if (img.complete) return show();
  img.addEventListener('load', show, { once: true });
  img.addEventListener('error', show, { once: true });
}
const scan = (root) => {
  if (root.nodeType !== 1) return;
  if (root.matches('img[data-fade]')) reveal(root);
  root.querySelectorAll?.('img[data-fade]').forEach(reveal);
};
new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
scan(document.body);

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
    <a class="line-item__img" href="${productUrl(p.slug)}" tabindex="-1" aria-hidden="true"><img src="${esc(p.images[0])}" alt="" width="144" height="180"></a>
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
