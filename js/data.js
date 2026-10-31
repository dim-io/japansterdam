// Data loading, caching and shared helpers.
let _content, _products;

async function load(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
export const getContent = () => (_content ??= load('data/content.json'));
export const getProducts = () => (_products ??= load('data/products.json'));

export async function getProduct(slug) {
  const all = await getProducts();
  return all.find((p) => p.slug === slug) || null;
}

export const formatPrice = (n) => '€' + Math.round(Number(n)).toLocaleString('en-US');

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const stripHtml = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export const productUrl = (slug) => 'product.html?p=' + encodeURIComponent(slug);
export const brandUrl = (brand) => 'shop.html?brand=' + encodeURIComponent(brand);

export const byNewest = (a, b) => b.addedOn - a.addedOn;
// available pieces first, then newest
export const byAvailability = (a, b) => Number(a.sold) - Number(b.sold);

export function altFor(p, i) {
  return p.name + (i === 0 ? ' front' : i === 1 ? ' detail' : ' detail ' + i);
}

export function cardHTML(p) {
  const img1 = p.images[0], img2 = p.images[1];
  return `<a class="card${p.sold ? ' card--sold' : ''}" href="${productUrl(p.slug)}">
  <div class="card__media">
    ${p.sold ? '<span class="tag-sold">Sold</span>' : ''}
    <img src="${esc(img1)}" alt="${esc(altFor(p, 0))}" width="960" height="1200" loading="lazy" decoding="async">
    ${img2 ? `<img class="alt" src="${esc(img2)}" alt="" width="960" height="1200" loading="lazy" decoding="async">` : ''}
  </div>
  <div class="card__body">
    <p class="card__brand">${esc(p.brand)}</p>
    <h3 class="card__name">${esc(p.name)}</h3>
    <p class="card__meta">Size ${esc(p.size)} · ${formatPrice(p.price)}</p>
  </div>
</a>`;
}

// Same brand first, then same category; available pieces preferred.
export function related(product, all, n = 4) {
  const others = all.filter((p) => p.slug !== product.slug);
  const rank = (list) => [...list].sort((a, b) => byAvailability(a, b) || byNewest(a, b));
  const sameBrand = rank(others.filter((p) => p.brand === product.brand));
  const sameCat = rank(others.filter((p) => p.brand !== product.brand && p.category === product.category));
  const rest = rank(others.filter((p) => p.brand !== product.brand && p.category !== product.category));
  const items = [...sameBrand, ...sameCat, ...rest].slice(0, n);
  return { items, byBrand: sameBrand.length >= n };
}

export function setMeta({ title, description, image, url }) {
  if (title) {
    document.title = title;
    setTag('meta[property="og:title"]', title);
  }
  if (description) {
    setTag('meta[name="description"]', description);
    setTag('meta[property="og:description"]', description);
  }
  if (image) setTag('meta[property="og:image"]', new URL(image, location.href).href);
  if (url) setTag('meta[property="og:url"]', url);
}
function setTag(sel, value) {
  const el = document.head.querySelector(sel);
  if (el) el.setAttribute('content', value);
}

export function jsonLd(obj) {
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(obj);
  document.head.appendChild(s);
}
