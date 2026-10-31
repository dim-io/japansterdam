import './layout.js';
import { getContent, getProducts, byNewest, cardHTML, esc } from './data.js';

const [c, products] = await Promise.all([getContent(), getProducts()]);
const h = c.home;

// marquee: two identical groups, translated by -50%
const marquee = document.getElementById('marquee');
const item = `<span class="marquee__item">${esc(h.marquee)}</span>`;
const group = (hidden) => `<div class="marquee__group"${hidden ? ' aria-hidden="true"' : ''}>${item}${item}</div>`;
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

// quote
document.getElementById('quote-text').textContent = '“' + h.quote + '”';
document.getElementById('quote-by').textContent = h.quoteBy;

// testimonials
document.getElementById('testi-title').textContent = h.testimonialsTitle;
document.getElementById('testi-grid').innerHTML = h.testimonials
  .map((t) => `<figure class="testi"><blockquote>“${esc(t.text)}”</blockquote><figcaption>${esc(t.name)}</figcaption></figure>`)
  .join('');
