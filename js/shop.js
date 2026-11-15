import { brandOptions, brandCounts, matchesBrand, shortBrand, brandSearchKey } from './brands.js?v=individual-labels-1';
import { filterSizes, matchesFit } from './sizing.js?v=footwear-filter-1';
import './layout.js?v=checkout-1';
import { getContent, getProducts, byNewest, byAvailability, cardHTML, esc } from './data.js';
import { onBagChange } from './bag.js';

const [c, products] = await Promise.all([getContent(), getProducts()]);
const CATS = ['Tops', 'Bottoms', 'Jackets & Outerwear', 'Sets', 'Footwear'];
const SORTS = { curated: 'Curated selection', newest: 'Newest', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low' };

document.getElementById('shop-title').textContent = c.shop.title;

const brandSel = document.getElementById('f-brand');
const sizeSel = document.getElementById('f-size');
const sortSel = document.getElementById('f-sort');
const chipsEl = document.getElementById('f-chips');
const grid = document.getElementById('shop-grid');
const countEl = document.getElementById('shop-count');

const brands = brandOptions(products);
const sizes = filterSizes(products);

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
const brandFilter = document.getElementById('brand-filter');
const brandToggle = document.getElementById('brand-toggle');
const brandPanel = document.getElementById('brand-panel');
const brandSearch = document.getElementById('brand-search');
const brandList = document.getElementById('brand-options');
function paintBrands() {
  const counts=brandCounts(products,p=>(!state.category||p.category===state.category)&&(!state.size||matchesFit(p,state.size)));
  const query=brandSearchKey(brandSearch.value);
  const choices=[['','All brands'],...brands.map(b=>[b,b])].filter(([value,label])=>!value||brandSearchKey(label).includes(query));
  if(state.brand&&!brands.includes(state.brand)&&(!query||brandSearchKey(state.brand).includes(query)))choices.push([state.brand,state.brand]);
  const total=products.filter(p=>!p.sold&&(!state.category||p.category===state.category)&&(!state.size||matchesFit(p,state.size))).length;
  brandList.innerHTML=choices.map(([value,label])=>{
    const count=!value?total:brands.includes(value)?(counts.get(value)||0):products.filter(p=>!p.sold&&matchesBrand(p,value)&&(!state.category||p.category===state.category)&&(!state.size||matchesFit(p,state.size))).length;
    return `<li><button class="brand-option" type="button" data-brand="${esc(value)}" aria-pressed="${value===state.brand}"><span>${esc(label)}</span><span class="brand-option__count" aria-label="${count} available pieces">${count}</span></button></li>`;
  }).join('');
  document.getElementById('brand-no-results').hidden=choices.some(([value])=>value);
}
function closeBrands(restoreFocus=false) {
  brandPanel.hidden=true;
  brandToggle.setAttribute('aria-expanded','false');
  if(restoreFocus)brandToggle.focus();
}
brandToggle.addEventListener('click',()=>{
  if(!brandPanel.hidden){closeBrands();return;}
  brandSearch.value='';paintBrands();brandPanel.hidden=false;
  brandToggle.setAttribute('aria-expanded','true');brandSearch.focus();
});
brandSearch.addEventListener('input',paintBrands);
brandList.addEventListener('click',event=>{
  const button=event.target.closest('[data-brand]');if(!button)return;
  brandSel.value=button.dataset.brand;
  brandSel.dispatchEvent(new Event('change'));
  closeBrands(true);
});
brandFilter.addEventListener('keydown',event=>{
  if(brandPanel.hidden)return;
  if(event.key==='Escape'){event.preventDefault();closeBrands(true);return;}
  const buttons=Array.from(brandList.querySelectorAll('button'));
  if(['ArrowDown','ArrowUp'].includes(event.key)){
    event.preventDefault();const at=buttons.indexOf(document.activeElement);
    const next=at<0?(event.key==='ArrowDown'?0:buttons.length-1):(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[next]?.focus();
  }
});
document.addEventListener('click',event=>{if(!brandFilter.contains(event.target))closeBrands();});
brandFilter.addEventListener('focusout',event=>{if(!brandFilter.contains(event.relatedTarget))closeBrands();});

function readState() {
  const q = new URLSearchParams(location.search);
  const cat = q.get('category') || '';
  const brand = q.get('brand') || '';
  const size = q.get('size') || '';
  const sort = q.get('sort') || 'curated';
  return {
    category: CATS.includes(cat) ? cat : '',
    brand: brands.includes(shortBrand(brand)) ? shortBrand(brand) : products.some(p=>p.brand===brand) ? brand : '',
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
  const availableSizes = filterSizes(products, state.category);
  if (state.size && !availableSizes.includes(state.size)) { state.size = ''; writeUrl(); }
  sizeSel.innerHTML = '<option value="">All sizes</option>' + availableSizes.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  document.querySelector('label[for="f-size"]').textContent = state.category === 'Footwear' ? 'Shoe size' : state.category ? 'Fits like' : 'Size / fit';
  chipsEl.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === state.category)));
  if(state.brand&&!brands.includes(state.brand)&&!Array.from(brandSel.options).some(o=>o.value===state.brand))brandSel.add(new Option(state.brand,state.brand));
  brandSel.value = state.brand;
  document.getElementById('brand-value').textContent = state.brand || 'All brands';
  paintBrands();
  sizeSel.value = state.size;
  sortSel.value = state.sort;
  const other = (p) => (!state.brand || matchesBrand(p, state.brand)) && (!state.size || matchesFit(p, state.size));
  const counts = { '': products.filter(other).length };
  for (const cat of CATS) counts[cat] = products.filter((p) => other(p) && p.category === cat).length;
  chipsEl.querySelectorAll('.chip').forEach((b) => { b.querySelector('.chip__n').textContent = counts[b.dataset.cat]; });
  let list = products.filter((p) => (!state.category || p.category === state.category) && (!state.brand || matchesBrand(p, state.brand)) && (!state.size || matchesFit(p, state.size)));
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
