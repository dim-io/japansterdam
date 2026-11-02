import './layout.js';
import { getContent, getProducts, byNewest, byAvailability, cardHTML, esc } from './data.js';
import { onBagChange } from './bag.js';

const [c, products] = await Promise.all([getContent(), getProducts()]);
const CATS = ['Tops', 'Bottoms', 'Jackets & Outerwear', 'Sets'];
const SORTS = { curated: 'Curated selection', newest: 'Newest', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low' };

document.getElementById('shop-title').textContent = c.shop.title;

const brandSel = document.getElementById('f-brand');
const sizeSel = document.getElementById('f-size');
const sortSel = document.getElementById('f-sort');
const chipsEl = document.getElementById('f-chips');
const grid = document.getElementById('shop-grid');
const countEl = document.getElementById('shop-count');

const brands = [...new Set(products.map((p) => p.brand))].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
const sizeRank = { XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6, XXXL: 7 };
const sizes = [...new Set(products.map((p) => p.size))].sort((a, b) => {
  const ra = sizeRank[a], rb = sizeRank[b];
  if (ra && rb) return ra - rb;
  if (ra) return -1;
  if (rb) return 1;
  return a.localeCompare(b, 'en', { numeric: true });
});

brandSel.innerHTML = '<option value="">All brands</option>' + brands.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
sizeSel.innerHTML = '<option value="">All sizes</option>' + sizes.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
sortSel.innerHTML = Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
chipsEl.innerHTML = ['All', ...CATS].map((n) => `<button class="chip" type="button" data-cat="${n === 'All' ? '' : esc(n)}" aria-pressed="false">${esc(n)} <span class="chip__n"></span></button>`).join('');

// grid density: 'compact' (default; 4 / 3 / 2 per row) or 'large' (2 / 2 / 1 per row)
const DKEY = 'jp_density';
const densityEl = document.getElementById('density');
let density = 'compact';
try { const d = localStorage.getItem(DKEY); if (d === 'large' || d === 'compact') density = d; } catch {}
const mqWide = matchMedia('(min-width:1100px)'), mqMid = matchMedia('(min-width:640px)');
function paintDensity() {
  const compact = mqWide.matches ? 4 : mqMid.matches ? 3 : 2;
  const large = mqMid.matches ? 2 : 1;
  grid.classList.toggle('grid--large', density === 'large');
  for (const [key, n] of [['large', large], ['compact', compact]]) {
    const b = densityEl.querySelector(`[data-d="${key}"]`);
    b.textContent = n;
    b.setAttribute('aria-label', `${n} ${n === 1 ? 'piece' : 'pieces'} per row`);
    b.setAttribute('aria-pressed', String(density === key));
  }
}
densityEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-d]');
  if (!b) return;
  density = b.dataset.d;
  try { localStorage.setItem(DKEY, density); } catch {}
  paintDensity();
});
mqWide.addEventListener('change', paintDensity);
mqMid.addEventListener('change', paintDensity);

const state = readState();
function readState() {
  const q = new URLSearchParams(location.search);
  const cat = q.get('category') || '';
  const brand = q.get('brand') || '';
  const size = q.get('size') || '';
  const sort = q.get('sort') || 'curated';
  return {
    category: CATS.includes(cat) ? cat : '',
    brand: brands.includes(brand) ? brand : '',
    size: sizes.includes(size) ? size : '',
    sort: Object.hasOwn(SORTS, sort) ? sort : 'curated',
  };
}
function writeUrl() {
  const q = new URLSearchParams();
  if (state.category) q.set('category', state.category);
  if (state.brand) q.set('brand', state.brand);
  if (state.size) q.set('size', state.size);
  if (state.sort !== 'curated') q.set('sort', state.sort);
  const s = q.toString();
  history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
}

function render() {
  chipsEl.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === state.category)));
  brandSel.value = state.brand;
  sizeSel.value = state.size;
  sortSel.value = state.sort;
  const other = (p) => (!state.brand || p.brand === state.brand) && (!state.size || p.size === state.size);
  const counts = { '': products.filter(other).length };
  for (const cat of CATS) counts[cat] = products.filter((p) => other(p) && p.category === cat).length;
  chipsEl.querySelectorAll('.chip').forEach((b) => { b.querySelector('.chip__n').textContent = counts[b.dataset.cat]; });
  let list = products.filter((p) => (!state.category || p.category === state.category) && (!state.brand || p.brand === state.brand) && (!state.size || p.size === state.size));
  // Filtering keeps the CMS order. Stable sorting only moves sold pieces down
  // unless the visitor explicitly chooses a date or price order.
  const cmp = state.sort === 'price-asc' ? (a, b) => a.price - b.price : state.sort === 'price-desc' ? (a, b) => b.price - a.price : state.sort === 'newest' ? byNewest : () => 0;
  list.sort((a, b) => byAvailability(a, b) || cmp(a, b));
  countEl.textContent = list.length + (list.length === 1 ? ' piece' : ' pieces');
  grid.innerHTML = list.length
    ? list.map(cardHTML).join('')
    : `<div class="empty-state"><p>${esc(c.shop.empty || 'Nothing here right now.')}</p><button class="btn" type="button" data-reset>${esc(c.shop.clear || 'Clear filters')}</button></div>`;
}

chipsEl.addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  state.category = b.dataset.cat;
  writeUrl();
  paintDensity();
  render();
});
for (const [el, key] of [[brandSel, 'brand'], [sizeSel, 'size'], [sortSel, 'sort']]) {
  el.addEventListener('change', () => {
    state[key] = el.value;
    writeUrl();
    paintDensity();
    render();
  });
}
grid.addEventListener('click', (e) => {
  if (!e.target.closest('[data-reset]')) return;
  state.category = state.brand = state.size = '';
  writeUrl();
  paintDensity();
  render();
});

// promises + closing quote
document.getElementById('promises').innerHTML = '<ul>' + c.shop.promises.map((t) => `<li>${esc(t)}</li>`).join('') + '</ul>';
document.getElementById('closing-quote').textContent = '“' + c.shop.closingQuote + '”';

onBagChange(render);
paintDensity();
render();
