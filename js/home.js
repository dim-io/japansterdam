import './layout.js';
import { getContent, getProducts, byNewest, cardHTML, esc, catNo, productUrl, brandUrl, formatPrice } from './data.js';

const [c, products] = await Promise.all([getContent(), getProducts()]);
const h = c.home;

// shoppable hero: caption linking to the product worn by the model
const hp = h.heroProduct && products.find((p) => p.slug === h.heroProduct.slug);
const cap = document.getElementById('hero-cap');
if (hp && cap) {
  cap.href = productUrl(hp.slug);
  cap.innerHTML = `<span class="tnum">${catNo(hp)}</span> — ${esc(h.heroProduct.label || hp.name)} · Size ${esc(hp.size)} · ${formatPrice(hp.price)} <span aria-hidden="true">→</span>`;
  cap.hidden = false;
}

// marquee: "Now online:" first, then the brands separated by a red cross. Two identical groups, translated by -50%.
const marquee = document.getElementById('marquee');
const X = '<svg class="marquee__x" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="2.2" fill="none"/></svg>';
const lead = 'Now online:';
const raw = h.marquee.startsWith(lead) ? h.marquee.slice(lead.length) : h.marquee;
const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
const seq = () => `<span class="marquee__seq"><span class="marquee__item">${lead}</span>${names.map((n) => `<span class="marquee__item">${esc(n)}</span>${X}`).join('')}</span>`;
const group = (hidden) => `<div class="marquee__group"${hidden ? ' aria-hidden="true"' : ''}>${seq()}${seq()}</div>`;
marquee.innerHTML = `<div class="marquee__track">${group(false)}${group(true)}</div>`;
requestAnimationFrame(() => {
  const g = marquee.querySelector('.marquee__group');
  if (g) marquee.style.setProperty('--marquee-d', Math.max(40, Math.round(g.offsetWidth / 70)) + 's');
});

// collection
document.getElementById('collection-title').textContent = h.collectionTitle;
const cta = document.getElementById('collection-cta');
cta.textContent = h.collectionCta;
const newest = [...products].sort(byNewest);
const pick = newest.filter((p) => !p.sold).slice(0, 4);
document.getElementById('collection-grid').innerHTML = pick.map(cardHTML).join('');

// brand index
document.getElementById('brands-title').textContent = h.brandsTitle || 'Brands';
const byBrand = new Map();
for (const p of newest) {
  const e = byBrand.get(p.brand);
  if (e) e.n++; else byBrand.set(p.brand, { brand: p.brand, n: 1, img: p.images[0] }); // newest piece comes first
}
const rows = [...byBrand.values()].sort((a, b) => a.brand.localeCompare(b.brand, 'en', { sensitivity: 'base' }));
const list = document.getElementById('brand-index');
list.innerHTML = rows.map((r) => `<li><a class="brand-row" href="${brandUrl(r.brand)}" data-img="${esc(r.img)}"><span class="brand-row__name">${esc(r.brand)}<sup class="brand-row__n" aria-label="${r.n} ${r.n === 1 ? 'piece' : 'pieces'}">${r.n}</sup></span></a></li>`).join('');

if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const float = document.createElement('div');
  float.className = 'brand-float';
  float.setAttribute('aria-hidden', 'true');
  const fimg = document.createElement('img');
  fimg.alt = '';
  float.appendChild(fimg);
  document.body.appendChild(float);
  const W = 220, H = 275;
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, shown = false;
  const place = () => {
    cx += (tx - cx) * (reduce ? 1 : 0.18);
    cy += (ty - cy) * (reduce ? 1 : 0.18);
    float.style.transform = `translate3d(${Math.round(cx)}px,${Math.round(cy)}px,0)`;
    raf = Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5 ? requestAnimationFrame(place) : 0;
  };
  const move = (e) => {
    const right = e.clientX + 32 + W > innerWidth;
    tx = right ? e.clientX - 32 - W : e.clientX + 32;
    ty = Math.min(Math.max(8, e.clientY - H / 2), innerHeight - H - 8);
    if (!shown) { cx = tx; cy = ty; }
    if (!raf) raf = requestAnimationFrame(place);
  };
  list.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const a = e.target.closest('.brand-row');
    if (!a || !list.contains(a)) return;
    list.querySelector('.is-active')?.classList.remove('is-active');
    a.classList.add('is-active');
    list.classList.add('is-hover');
    if (fimg.getAttribute('src') !== a.dataset.img) fimg.src = a.dataset.img;
    move(e);
    shown = true;
    float.classList.add('is-on');
  });
  list.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') move(e); });
  list.addEventListener('pointerleave', () => {
    list.classList.remove('is-hover');
    list.querySelector('.is-active')?.classList.remove('is-active');
    float.classList.remove('is-on');
    shown = false;
  });
}

// quote
document.getElementById('quote-text').textContent = '“' + h.quote + '”';
document.getElementById('quote-by').textContent = h.quoteBy;

// testimonials
document.getElementById('testi-title').textContent = h.testimonialsTitle;
document.getElementById('testi-grid').innerHTML = h.testimonials
  .map((t) => `<figure class="testi"><span class="testi__mark" aria-hidden="true">“</span><blockquote>${esc(t.text)}</blockquote><figcaption>${esc(t.name)}</figcaption></figure>`)
  .join('');
