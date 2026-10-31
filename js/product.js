import './layout.js';
import { getContent, getProducts, getProduct, formatPrice, esc, stripHtml, productUrl, brandUrl, altFor, cardHTML, catNo, related, setMeta, jsonLd } from './data.js';
import { inBag, addToBag, onBagChange } from './bag.js';

const root = document.getElementById('pdp-root');
const slug = new URLSearchParams(location.search).get('p') || '';
const [c, all] = await Promise.all([getContent(), getProducts()]);
const p = all.find((x) => x.slug === slug);

if (!p) {
  document.title = 'Piece not found — Japansterdam';
  const m = document.querySelector('meta[name="robots"]') || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'robots' }));
  m.content = 'noindex';
  root.innerHTML = `<div class="wrap notfound"><h1 class="page-title">Piece not found</h1><p>This piece does not exist or is no longer listed.</p><a class="btn btn--primary" href="shop.html">Back to the shop</a></div>`;
} else {
  const email = c.site.email;
  const desc = stripHtml(p.description).slice(0, 155);
  setMeta({
    title: `${p.name} — ${p.brand} — Japansterdam`,
    description: `${p.brand} ${p.name}, size ${p.size}, ${formatPrice(p.price)}. ${desc}`.slice(0, 200),
    image: p.images[0],
    url: new URL(productUrl(p.slug), location.href).href,
  });
  jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    brand: { '@type': 'Brand', name: p.brand },
    category: p.category,
    size: p.size,
    description: stripHtml(p.description),
    image: p.images.map((i) => new URL(i, location.href).href),
    offers: {
      '@type': 'Offer',
      url: new URL(productUrl(p.slug), location.href).href,
      price: Number(p.price).toFixed(2),
      priceCurrency: 'EUR',
      itemCondition: 'https://schema.org/UsedCondition',
      availability: p.sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
    },
  });

  const n = p.images.length;
  const slides = p.images.map((src, i) => `<figure class="gallery__slide"><button class="gallery__open" type="button" data-i="${i}" aria-label="Enlarge photo ${i + 1} of ${n}" aria-haspopup="dialog"><img src="${esc(src)}" alt="${esc(altFor(p, i))}" width="960" height="1200" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" data-fade></button></figure>`).join('');
  const dots = p.images.length > 1 ? `<div class="gallery__dots" aria-hidden="true">${p.images.map((_, i) => `<span${i === 0 ? ' class="is-active"' : ''}></span>`).join('')}</div>` : '';
  const subject = encodeURIComponent('Question about ' + p.name);

  root.innerHTML = `<div class="wrap pdp">
  <p class="crumbs"><a href="shop.html">Shop</a> / <a href="${brandUrl(p.brand)}">${esc(p.brand)}</a></p>
  <div class="gallery" aria-label="Photos of ${esc(p.name)}"><div class="gallery__track" tabindex="0">${slides}</div>${dots}</div>
  <div class="pdp__info">
    <div class="pdp__top"><a class="brand" href="${brandUrl(p.brand)}">${esc(p.brand)}</a><p class="catno">${catNo(p)}</p></div>
    <h1 class="h-block pdp__name">${esc(p.name)}</h1>
    <div class="pdp__row"><span class="pill">Size ${esc(p.size)}</span><span class="pdp__price">${formatPrice(p.price)}</span></div>
    <dl class="facts">
      <div><dt>Brand</dt><dd>${esc(p.brand)}</dd></div>
      <div><dt>Category</dt><dd>${esc(p.category)}</dd></div>
      <div><dt>Size</dt><dd>${esc(p.size)}</dd></div>
      <div><dt>Ref</dt><dd class="tnum">${catNo(p)}</dd></div>
    </dl>
    <button class="btn btn--primary btn--block" type="button" id="add-btn"></button>
    ${p.sold ? '' : `<p class="pdp__once">${esc((c.product && c.product.oneOnly) || '')}</p>`}
    <div class="pdp__desc rich">${p.description}</div>
    <div class="acc">
      <details><summary>Size guide</summary><div class="acc__body"><a href="size-guide.html">Open the size guide</a></div></details>
      <details><summary>Questions? Email ${esc(email)}</summary><div class="acc__body"><a href="mailto:${esc(email)}?subject=${subject}">${esc(email)}</a></div></details>
    </div>
  </div>
</div>
${p.sold ? '' : `<div class="buybar" id="buybar"><div class="buybar__info"><span class="buybar__name">${esc(p.name)}</span><span class="buybar__price">${formatPrice(p.price)}</span></div><button class="btn btn--primary btn--sm" type="button" id="bar-btn"></button></div>`}`;

  // main + sticky-bar buttons share one state
  const btn = document.getElementById('add-btn');
  const barBtn = document.getElementById('bar-btn');
  const btns = [btn, barBtn].filter(Boolean);
  const paint = () => {
    const [label, off] = p.sold ? ['Sold', true] : inBag(p.slug) ? ['In your bag', true] : ['Add to bag', false];
    btns.forEach((b) => { b.textContent = label; b.disabled = off; });
  };
  btns.forEach((b) => b.addEventListener('click', () => {
    addToBag(p.slug);
    window.dispatchEvent(new Event('jp:openbag'));
  }));
  onBagChange(paint);
  paint();

  // mobile sticky bar: visible once the main button has scrolled out of view (above the viewport)
  const bar = document.getElementById('buybar');
  if (bar && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      bar.classList.toggle('is-on', !e.isIntersecting && e.boundingClientRect.top < 0);
    }).observe(btn);
  }

  // lightbox
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', `Photos of ${p.name}`);
  lb.hidden = true;
  lb.innerHTML = `<p class="lb__count tnum" aria-live="polite"></p>
  <button class="lb__btn lb__close" type="button" aria-label="Close">&times;</button>
  <button class="lb__btn lb__nav lb__prev" type="button" aria-label="Previous photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M15 4l-8 8 8 8"/></svg></button>
  <div class="lb__stage"><img class="lb__img" alt=""></div>
  <button class="lb__btn lb__nav lb__next" type="button" aria-label="Next photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 4l8 8-8 8"/></svg></button>`;
  document.body.appendChild(lb);
  const lbImg = lb.querySelector('.lb__img'), lbCount = lb.querySelector('.lb__count');
  const prevB = lb.querySelector('.lb__prev'), nextB = lb.querySelector('.lb__next'), closeB = lb.querySelector('.lb__close');
  let cur = 0, opener = null;
  const show = (i) => {
    cur = (i + n) % n;
    lbImg.src = p.images[cur];
    lbImg.alt = altFor(p, cur);
    lbCount.textContent = `${cur + 1} / ${n}`;
  };
  const open = (i, from) => {
    opener = from;
    show(i);
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    closeB.focus();
  };
  const close = () => {
    lb.hidden = true;
    document.body.style.overflow = '';
    if (opener && document.contains(opener)) opener.focus();
  };
  if (n < 2) { prevB.hidden = nextB.hidden = true; }
  root.querySelector('.gallery').addEventListener('click', (e) => {
    const b = e.target.closest('.gallery__open');
    if (b) open(Number(b.dataset.i), b);
  });
  prevB.addEventListener('click', () => show(cur - 1));
  nextB.addEventListener('click', () => show(cur + 1));
  closeB.addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target.classList.contains('lb__stage') || e.target === lb) close(); });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && n > 1) show(cur - 1);
    else if (e.key === 'ArrowRight' && n > 1) show(cur + 1);
    else if (e.key === 'Tab') {
      const f = [...lb.querySelectorAll('button')].filter((x) => !x.hidden);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!lb.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });
  let sx = 0, sy = 0;
  lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (n > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(cur + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // mobile gallery dots
  const track = root.querySelector('.gallery__track');
  const dotEls = root.querySelectorAll('.gallery__dots span');
  if (dotEls.length) {
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      dotEls.forEach((d, n) => d.classList.toggle('is-active', n === i));
    }, { passive: true });
  }

  // related
  const rel = related(p, all, 4);
  if (rel.items.length) {
    const sec = document.getElementById('related');
    sec.hidden = false;
    document.getElementById('related-title').textContent = rel.byBrand ? `More from ${p.brand}` : 'You may also like';
    document.getElementById('related-grid').innerHTML = rel.items.map(cardHTML).join('');
  }
}
