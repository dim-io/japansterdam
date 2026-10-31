import './layout.js';
import { getContent, getProducts, getProduct, formatPrice, esc, stripHtml, productUrl, brandUrl, altFor, cardHTML, related, setMeta, jsonLd } from './data.js';
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

  const slides = p.images.map((src, i) => `<figure class="gallery__slide"><img src="${esc(src)}" alt="${esc(altFor(p, i))}" width="960" height="1200" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></figure>`).join('');
  const dots = p.images.length > 1 ? `<div class="gallery__dots" aria-hidden="true">${p.images.map((_, i) => `<span${i === 0 ? ' class="is-active"' : ''}></span>`).join('')}</div>` : '';
  const subject = encodeURIComponent('Question about ' + p.name);

  root.innerHTML = `<div class="wrap pdp">
  <p class="crumbs"><a href="shop.html">Shop</a> / <a href="${brandUrl(p.brand)}">${esc(p.brand)}</a></p>
  <div class="gallery" aria-label="Photos of ${esc(p.name)}"><div class="gallery__track" tabindex="0">${slides}</div>${dots}</div>
  <div class="pdp__info">
    <a class="brand" href="${brandUrl(p.brand)}">${esc(p.brand)}</a>
    <h1 class="h-block pdp__name">${esc(p.name)}</h1>
    <div class="pdp__row"><span class="pill">Size ${esc(p.size)}</span><span class="pdp__price">${formatPrice(p.price)}</span></div>
    <button class="btn btn--primary btn--block" type="button" id="add-btn"></button>
    <div class="pdp__desc rich">${p.description}</div>
    <div class="acc">
      <details><summary>Size guide</summary><div class="acc__body"><a href="size-guide.html">Open the size guide</a></div></details>
      <details><summary>Questions? Email ${esc(email)}</summary><div class="acc__body"><a href="mailto:${esc(email)}?subject=${subject}">${esc(email)}</a></div></details>
    </div>
  </div>
</div>`;

  const btn = document.getElementById('add-btn');
  const paint = () => {
    if (p.sold) { btn.textContent = 'Sold'; btn.disabled = true; }
    else if (inBag(p.slug)) { btn.textContent = 'In your bag'; btn.disabled = true; }
    else { btn.textContent = 'Add to bag'; btn.disabled = false; }
  };
  btn.addEventListener('click', () => {
    addToBag(p.slug);
    window.dispatchEvent(new Event('jp:openbag'));
  });
  onBagChange(paint);
  paint();

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
