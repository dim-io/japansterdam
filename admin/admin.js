import { API_BASE } from '../js/config.js';
import { createProductRoutes } from '../js/product-urls.js';
import { MEASUREMENT_FIELDS, formatMeasurement, measurementsBlock } from '../js/measurements.js';

const TOKEN_KEY = 'jp_admin_token';
const CATEGORIES = ['Tops', 'Bottoms', 'Jackets & Outerwear', 'Sets', 'Accessories'];
const CONDITIONS = ['New / unworn', 'Excellent', 'Very good', 'Good', 'Fair'];
const SECTION_NAMES = {
  site: 'General', home: 'Home page', shop: 'Shop', about: 'About', contact: 'Contact', shipping: 'Shipping & returns',
  faq: 'FAQ', sizeGuide: 'Size guide', privacy: 'Privacy', product: 'Product page',
};
const $ = (s, r = document) => r.querySelector(s);
const base = () => API_BASE.replace(/\/+$/, '');

/* ---------- tiny DOM helper ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const imgSrc = (u) => (/^(https?:)?\/\//i.test(u) || u.startsWith('data:') ? u : '../' + u);
const formatPrice = (n) => '€' + Math.round(Number(n) || 0).toLocaleString('en-US');
const humanize = (k) => { const s = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };

/* ---------- state ---------- */
let token = localStorage.getItem(TOKEN_KEY);
let user = null;
let products = [];
let content = null;
let dirty = false;
let saveFn = null; // current view's save
let uploading = 0;

/* ---------- toasts, dialogs ---------- */
function toast(msg, error = false) {
  const t = h('div', { class: 'toast' + (error ? ' toast--error' : ''), role: error ? 'alert' : 'status' }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), error ? 6000 : 2800);
}
function confirmDialog({ title, text, ok = 'OK', danger = false }) {
  const d = $('#dlg-confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text || '';
  const okBtn = $('#confirm-ok');
  okBtn.textContent = ok;
  okBtn.className = 'btn ' + (danger ? 'btn--danger' : 'btn--primary');
  return new Promise((res) => {
    d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true });
    d.returnValue = 'cancel';
    d.showModal();
  });
}
function setDirty(v) {
  dirty = v;
  document.querySelectorAll('.dirty').forEach((e) => e.classList.toggle('is-on', v));
}
window.addEventListener('beforeunload', (e) => { if (dirty || uploading) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- api ---------- */
class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(path, { method = 'GET', body, form, auth = true } = {}) {
  if (!API_BASE) throw new ApiError(0, 'The API address is not set yet (js/config.js).');
  const headers = {};
  if (auth && token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(base() + path, { method, headers, body: payload }); }
  catch { throw new ApiError(0, 'Cannot reach the server. Check your connection.'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) { forceLogin('Your session ended. Please log in again.'); throw new ApiError(401, 'Not logged in'); }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong');
  return data;
}

/* ---------- auth ---------- */
function showLogin(msg = '') {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-error').textContent = msg || (API_BASE ? '' : 'The API address is not set yet. Set API_BASE in js/config.js.');
  document.title = 'Log in · Japansterdam admin';
  setTimeout(() => $('#login-user').focus(), 0);
}
function forceLogin(msg) {
  token = null; user = null;
  localStorage.removeItem(TOKEN_KEY);
  setDirty(false);
  showLogin(msg);
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; $('#login-error').textContent = '';
  try {
    const r = await api('/auth/login', { method: 'POST', body: { username: $('#login-user').value, password: $('#login-pass').value }, auth: false });
    token = r.token; user = r.user;
    localStorage.setItem(TOKEN_KEY, token);
    $('#login-pass').value = '';
    await enterApp();
  } catch (err) { $('#login-error').textContent = err.message; }
  btn.disabled = false;
});

function renderProfile() {
  $('#profile-initial').textContent = (user.displayName || user.username).trim().charAt(0);
  $('#profile-name').textContent = user.displayName;
}
async function enterApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  renderProfile();
  products = []; content = null;
  if (!location.hash) location.hash = '#/products';
  await route();
}
async function boot() {
  if (!token) return showLogin();
  try { user = (await api('/auth/me')).user; } catch (e) { if (e.status !== 401) showLogin(e.message); return; }
  await enterApp();
}

/* profile menu */
const menuBtn = $('#profile-btn'), menu = $('#profile-menu');
const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', String(!menu.hidden)); });
document.addEventListener('click', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
menu.addEventListener('click', async (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act) return;
  closeMenu();
  if (act === 'profile') { $('#profile-display').value = user.displayName; $('#profile-error').textContent = ''; $('#dlg-profile').showModal(); }
  if (act === 'password') { $('#form-password').reset(); $('#pw-error').textContent = ''; $('#dlg-password').showModal(); }
  if (act === 'logout') {
    if (dirty && !(await confirmDialog({ title: 'Log out?', text: 'You have unsaved changes that will be lost.', ok: 'Log out', danger: true }))) return;
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    forceLogin('');
  }
});
$('#form-profile').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  try {
    const r = await api('/auth/profile', { method: 'PATCH', body: { displayName: $('#profile-display').value } });
    user = r.user; renderProfile(); $('#dlg-profile').close(); toast('Profile saved');
  } catch (err) { $('#profile-error').textContent = err.message; }
});
$('#form-password').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  const err = $('#pw-error'); err.textContent = '';
  if ($('#pw-new').value !== $('#pw-rep').value) return void (err.textContent = 'The new passwords do not match.');
  if ($('#pw-new').value.length < 4) return void (err.textContent = 'Use at least 4 characters.');
  try {
    await api('/auth/password', { method: 'POST', body: { currentPassword: $('#pw-cur').value, newPassword: $('#pw-new').value } });
    $('#dlg-password').close(); toast('Password changed');
  } catch (er) { err.textContent = er.message; }
});

/* ---------- routing ---------- */
let routing = false;
async function route(keepDirty = false) {
  if (!user) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const view = parts[0] || 'products';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === view));
  saveFn = null;
  if (!keepDirty) setDirty(false);
  if (view !== 'pages') content = null;
  const el = $('#view');
  el.replaceChildren(h('p', { class: 'loading' }, 'Loading…'));
  try {
    if (view === 'products' && parts[1]) await viewEditor(parts[1]);
    else if (view === 'products') await viewProducts();
    else if (view === 'pages') await viewPages(parts[1]);
    else { location.hash = '#/products'; }
  } catch (e) {
    if (e.status === 401) return;
    el.replaceChildren(h('p', { class: 'loading' }, e.message));
  }
}
let lastHash = location.hash;
const inPages = (hash) => hash.startsWith('#/pages');
window.addEventListener('hashchange', async () => {
  if (routing) return;
  const samePages = inPages(lastHash) && inPages(location.hash);
  if (dirty && !samePages) {
    const next = location.hash;
    routing = true; location.hash = lastHash; await new Promise((r) => setTimeout(r, 0));
    const ok = await confirmDialog({ title: 'Leave without saving?', text: 'Your changes on this page will be lost.', ok: 'Leave', danger: true });
    routing = false;
    if (!ok) return;
    setDirty(false); location.hash = next;
    return;
  }
  lastHash = location.hash;
  route(samePages);
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (saveFn) saveFn(); }
});
const setTitle = (t, extra) => { $('#top-title').replaceChildren(t, extra || ''); document.title = t + ' · Japansterdam admin'; };

async function loadProducts(force) {
  if (!products.length || force) products = await api('/admin/products');
  return products;
}
const numberMap = () => {
  const m = new Map();
  [...products].sort((a, b) => a.addedOn - b.addedOn || (a.slug < b.slug ? -1 : 1)).forEach((p, i) => m.set(p.slug, i + 1));
  return m;
};
const noLabel = (n) => 'No. ' + String(n).padStart(3, '0');

/* ---------- products list ---------- */
let listState = { q: '', filter: 'all' };
async function viewProducts() {
  await loadProducts(true);
  setTitle('Products');
  const root = $('#view');
  const nums = numberMap();
  let dragSlug = null;
  let savingOrder = false;

  const count = h('span', { class: 'count' });
  const list = h('div', { class: 'plist' });
  const search = h('input', { type: 'search', class: 'grow', placeholder: 'Search name or brand', 'aria-label': 'Search', value: listState.q });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter' },
    ['all', 'available', 'sold'].map((f) => h('button', { type: 'button', 'data-f': f, onclick: () => { listState.filter = f; draw(); } }, f === 'all' ? 'All' : f === 'available' ? 'Available' : 'Sold')));
  search.addEventListener('input', () => { listState.q = search.value; draw(); });
  root.replaceChildren(
    h('p', { class: 'hint', style: 'margin:0 0 16px' }, 'Shop order: put your strongest pieces first. This is the default “Curated selection” in the shop. Use ⇡ to move a piece straight to the top, drag to arrange the rest, or use the arrows. Changes save automatically; sold pieces appear last in the shop.'),
    h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, search), seg, count, h('a', { class: 'btn btn--primary', href: '#/products/new' }, 'New product')),
    list, h('p', { class: 'hint', id: 'reorder-hint', style: 'margin-top:10px' }, ''));

  async function persistOrder(previousOrder) {
    savingOrder = true; draw();
    try { await api('/admin/products/reorder', { method: 'POST', body: { slugs: products.map((p) => p.slug) } }); toast('Shop order saved'); }
    catch (e) {
      products = previousOrder;
      toast(e.message, true);
      try { await loadProducts(true); } catch {}
    }
    finally { savingOrder = false; draw(); }
  }
  function move(slug, toIndex) {
    if (savingOrder) return;
    const from = products.findIndex((p) => p.slug === slug);
    if (from < 0 || toIndex < 0 || toIndex >= products.length || from === toIndex) return;
    const previousOrder = [...products];
    const [p] = products.splice(from, 1);
    products.splice(toIndex, 0, p);
    dragSlug = null; persistOrder(previousOrder);
  }
  async function toggleSold(p, btn) {
    btn.disabled = true;
    try {
      const upd = await api('/admin/products/' + encodeURIComponent(p.slug), { method: 'PUT', body: { ...p, sold: !p.sold } });
      Object.assign(p, upd); toast(p.sold ? 'Marked as sold' : 'Marked as available');
    } catch (e) { toast(e.message, true); }
    draw();
  }
  function draw() {
    const q = listState.q.trim().toLowerCase();
    const filtering = !!q || listState.filter !== 'all';
    const canReorder = !filtering && !savingOrder;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.f === listState.filter));
    const rows = products.filter((p) => (listState.filter === 'all' || (listState.filter === 'sold') === !!p.sold) && (!q || (p.name + ' ' + p.brand).toLowerCase().includes(q)));
    count.textContent = `${rows.length} of ${products.length}`;
    $('#reorder-hint').textContent = savingOrder ? 'Saving shop order…' : filtering ? 'Clear the search and filter to change the order.' : 'Drag the ⋮⋮ handle, use ⇡ to move to the top, or use the arrows. This order is the default in the shop.';
    list.replaceChildren(
      h('div', { class: 'prow prow--head' }, h('span', {}, ''), h('span', {}, ''), h('span', {}, 'No.'), h('span', {}, 'Name'), h('span', {}, 'Brand'), h('span', {}, 'Size'), h('span', {}, 'Price'), h('span', {}, 'Status')),
      ...(rows.length ? rows.map((p) => {
        const idx = products.indexOf(p);
        const row = h('div', { class: 'prow', tabindex: '0', role: 'link', 'aria-label': 'Edit ' + p.name, draggable: canReorder ? 'true' : null },
          h('div', { class: 'handle', onclick: (e) => e.stopPropagation() },
            filtering ? '' : [h('span', { class: 'grip', 'aria-hidden': 'true', title: 'Drag to reorder' }, '⋮⋮'),
              h('span', { class: 'moves' },
                h('button', { type: 'button', 'aria-label': 'Move to top', title: 'Move to top of the shop', disabled: !canReorder || idx === 0, onclick: () => move(p.slug, 0) }, '⇡'),
                h('button', { type: 'button', 'aria-label': 'Move up', disabled: !canReorder || idx === 0, onclick: () => move(p.slug, idx - 1) }, '▲'),
                h('button', { type: 'button', 'aria-label': 'Move down', disabled: !canReorder || idx === products.length - 1, onclick: () => move(p.slug, idx + 1) }, '▼'))]),
          p.images?.[0] ? h('img', { class: 'prow__thumb', src: imgSrc(p.images[0]), alt: '', loading: 'lazy' }) : h('span', { class: 'prow__thumb' }),
          h('span', { class: 'prow__no' }, noLabel(nums.get(p.slug))),
          h('span', { class: 'prow__name', title: p.name }, p.name),
          h('span', { class: 'prow__brand' }, p.brand),
          h('span', { class: 'prow__size' }, p.size),
          h('span', { class: 'prow__price' }, formatPrice(p.price)),
          h('button', { type: 'button', class: 'pill' + (p.sold ? ' pill--sold' : ''), title: 'Click to mark as ' + (p.sold ? 'available' : 'sold'), onclick: (e) => { e.stopPropagation(); toggleSold(p, e.currentTarget); } }, p.sold ? 'Sold' : 'Available'));
        const open = () => { location.hash = '#/products/' + encodeURIComponent(p.slug); };
        row.addEventListener('click', open);
        row.addEventListener('keydown', (e) => { if (e.target === row && e.key === 'Enter') open(); });
        if (canReorder) {
          row.addEventListener('dragstart', (e) => { dragSlug = p.slug; row.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.slug); });
          row.addEventListener('dragend', () => { dragSlug = null; row.classList.remove('is-drag'); list.querySelectorAll('.is-over').forEach((x) => x.classList.remove('is-over')); });
          row.addEventListener('dragover', (e) => { if (dragSlug) { e.preventDefault(); row.classList.add('is-over'); } });
          row.addEventListener('dragleave', () => row.classList.remove('is-over'));
          row.addEventListener('drop', (e) => { e.preventDefault(); if (dragSlug && dragSlug !== p.slug) move(dragSlug, idx); });
        }
        return row;
      }) : [h('p', { class: 'empty' }, 'No products found.')]));
  }
  draw();
}

/* ---------- product editor ---------- */
const blankProduct = () => ({ name: '', brand: '', category: 'Tops', size: '', price: 0, sold: false, description: '', images: [] });

function previewCard(p, no) {
  return h('div', { class: 'pcard' + (p.sold ? ' pcard--sold' : '') },
    h('div', { class: 'pcard__media' }, p.sold ? h('span', { class: 'pcard__tag' }, 'Sold') : '', p.images[0] ? h('img', { src: imgSrc(p.images[0]), alt: '' }) : ''),
    h('div', { class: 'pcard__top' }, h('p', { class: 'pcard__brand' }, p.brand || 'Brand'), h('p', { class: 'pcard__no' }, no)),
    h('h3', { class: 'pcard__name', style: 'font-family:var(--body);font-stretch:100%;text-transform:none;letter-spacing:0;font-weight:400;font-size:14px' }, p.name || 'Product name'),
    h('p', { class: 'pcard__meta' }, `Size ${p.size || '–'} · ${formatPrice(p.price)}`));
}

async function resizeImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Only JPEG, PNG or WebP');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not process the image');
  return blob;
}
function uploadWithProgress(blob, name, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', blob, name.replace(/\.[^.]+$/, '') + '.jpg');
    const x = new XMLHttpRequest();
    x.open('POST', base() + '/admin/images');
    x.setRequestHeader('Authorization', 'Bearer ' + token);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText); } catch {}
      if (x.status === 401) { forceLogin('Your session ended. Please log in again.'); return reject(new Error('Not logged in')); }
      if (x.status >= 200 && x.status < 300 && d.url) resolve(d.url); else reject(new Error(d.error || 'Upload failed'));
    };
    x.send(fd);
  });
}

async function viewEditor(slugParam) {
  await loadProducts();
  const isNew = slugParam === 'new';
  const orig = isNew ? null : products.find((p) => p.slug === slugParam);
  if (!isNew && !orig) { $('#view').replaceChildren(h('p', { class: 'loading' }, 'This product does not exist (anymore). '), h('a', { class: 'btn', href: '#/products' }, 'Back to products')); return; }
  const d = JSON.parse(JSON.stringify(orig || blankProduct()));
  d.measurements = d.measurements || {};
  let slug = orig?.slug;
  const removedOurs = [];
  const nums = numberMap();
  const noText = () => (slug ? noLabel(nums.get(slug)) : 'No. new');
  setTitle(isNew ? 'New product' : 'Edit product');

  const mark = () => { setDirty(true); refreshPreview(); };
  const previewHost = h('div', {});
  function refreshPreview() { previewHost.replaceChildren(previewCard(d, noText()), measurementsBlock(d.measurements)); }

  const measurementInputs = MEASUREMENT_FIELDS.map(([key, label]) => {
    const input = h('input', { type: 'number', min: '0.1', max: '1000', step: 'any', inputmode: 'decimal', value: d.measurements[key] ?? '', 'aria-label': label + ' in centimeters' });
    const inches = h('output', { class: 'measurement-inches' }, formatMeasurement(d.measurements[key], 'in'));
    input.addEventListener('input', () => {
      if (input.value === '') delete d.measurements[key];
      else d.measurements[key] = Number(input.value);
      inches.textContent = formatMeasurement(d.measurements[key], 'in');
      mark();
    });
    return { input, element: h('label', { class: 'field' }, h('span', {}, label + ' (cm)'), h('span', { class: 'measurement-input' }, input, inches)) };
  });

  const bind = (key, attrs = {}, type) => {
    const i = h('input', { ...attrs, value: d[key] ?? '' });
    i.addEventListener('input', () => { d[key] = type === 'number' ? (i.value === '' ? 0 : Number(i.value)) : i.value; mark(); });
    return i;
  };
  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))].sort();
  const name = bind('name', { type: 'text', required: true, maxlength: '200', autocomplete: 'off' });
  const brand = bind('brand', { type: 'text', list: 'brand-list', autocomplete: 'off' });
  const size = bind('size', { type: 'text', autocomplete: 'off' });
  const condition = h('select', { required: true, 'aria-label': 'Condition' },
    h('option', { value: '', selected: !d.condition, disabled: true }, 'Choose condition'),
    CONDITIONS.map((value) => h('option', { value, selected: value === d.condition }, value)));
  condition.addEventListener('change', () => { d.condition = condition.value; mark(); });
  const conditionNotes = h('textarea', { required: true, maxlength: '600', rows: '3', 'aria-label': 'Condition notes', placeholder: 'Describe wear, fading, repairs and flaws. If none are visible, say so.' });
  conditionNotes.value = d.conditionNotes || '';
  conditionNotes.addEventListener('input', () => { d.conditionNotes = conditionNotes.value; conditionNotes.setCustomValidity(''); mark(); });
  const price = bind('price', { type: 'number', min: '0', step: '1', inputmode: 'decimal' }, 'number');
  const cat = h('select', {}, CATEGORIES.map((c) => h('option', { value: c, selected: c === d.category }, c)));
  cat.addEventListener('change', () => { d.category = cat.value; mark(); });
  const sold = h('input', { type: 'checkbox', checked: d.sold });
  sold.addEventListener('change', () => { d.sold = sold.checked; mark(); });

  /* rich text */
  const rte = h('div', { class: 'rte', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Description' });
  rte.innerHTML = d.description || '';
  const src = h('textarea', { class: 'html-src', hidden: true, spellcheck: 'false', 'aria-label': 'Description HTML' });
  let htmlMode = false;
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
  rte.addEventListener('input', () => { d.description = rte.innerHTML; mark(); });
  rte.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
  src.addEventListener('input', () => { d.description = src.value; mark(); });
  const cmd = (c) => (e) => { e.preventDefault(); if (htmlMode) return; rte.focus(); document.execCommand(c); d.description = rte.innerHTML; mark(); };
  const htmlBtn = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => {
    htmlMode = !htmlMode;
    if (htmlMode) { src.value = rte.innerHTML; } else { rte.innerHTML = src.value; d.description = rte.innerHTML; }
    rte.hidden = htmlMode; src.hidden = !htmlMode;
    htmlBtn.classList.toggle('is-on', htmlMode); htmlBtn.setAttribute('aria-pressed', String(htmlMode));
    bar.querySelectorAll('[data-fmt]').forEach((b) => (b.disabled = htmlMode));
  } }, 'HTML');
  const bar = h('div', { class: 'rte-bar' },
    h('button', { type: 'button', 'data-fmt': '1', title: 'Bold', 'aria-label': 'Bold', onmousedown: cmd('bold'), style: 'font-weight:700' }, 'B'),
    h('button', { type: 'button', 'data-fmt': '1', title: 'Italic', 'aria-label': 'Italic', onmousedown: cmd('italic'), style: 'font-style:italic' }, 'I'),
    h('button', { type: 'button', 'data-fmt': '1', title: 'Bullet list', 'aria-label': 'Bullet list', onmousedown: cmd('insertUnorderedList') }, '• List'),
    h('span', { class: 'sp' }), htmlBtn);

  /* images */
  const grid = h('div', { class: 'imgs' });
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true });
  let dragIdx = null;
  const pending = []; // in-progress/failed tiles
  function drawImages() {
    grid.replaceChildren(
      ...d.images.map((u, i) => {
        const t = h('div', { class: 'img', draggable: 'true' },
          h('img', { src: imgSrc(u), alt: `Photo ${i + 1}` }),
          h('span', { class: 'img__n' }, i === 0 ? 'Cover' : String(i + 1)),
          h('button', { type: 'button', class: 'icon-btn icon-btn--danger img__x', 'aria-label': `Remove photo ${i + 1}`, onclick: () => {
            const [gone] = d.images.splice(i, 1);
            if (base() && gone.startsWith(base() + '/img/products/')) removedOurs.push(gone);
            drawImages(); mark();
          } }, '×'));
        t.addEventListener('dragstart', (e) => { dragIdx = i; t.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-jp-img', String(i)); });
        t.addEventListener('dragend', () => { dragIdx = null; t.classList.remove('is-drag'); });
        t.addEventListener('dragover', (e) => { if (dragIdx !== null) { e.preventDefault(); e.stopPropagation(); t.classList.add('is-over'); } });
        t.addEventListener('dragleave', () => t.classList.remove('is-over'));
        t.addEventListener('drop', (e) => {
          if (dragIdx === null) return;
          e.preventDefault(); e.stopPropagation();
          const [m] = d.images.splice(dragIdx, 1); d.images.splice(i, 0, m); dragIdx = null; drawImages(); mark();
        });
        return t;
      }),
      ...pending.map((p) => p.el));
  }
  async function addFiles(files) {
    for (const file of [...files]) {
      const bar = h('span', { class: 'img__bar', style: 'width:0' });
      const label = h('span', {}, 'Preparing…');
      const el = h('div', { class: 'img' }, h('div', { class: 'img__prog' }, label), bar);
      const tile = { el };
      pending.push(tile); drawImages(); uploading++;
      try {
        const blob = await resizeImage(file);
        label.textContent = 'Uploading…';
        const url = await uploadWithProgress(blob, file.name, (f) => { bar.style.width = Math.round(f * 100) + '%'; label.textContent = Math.round(f * 100) + '%'; });
        pending.splice(pending.indexOf(tile), 1);
        d.images.push(url); mark();
      } catch (e) {
        el.classList.add('img--err'); label.textContent = file.name + ': ' + e.message; bar.remove();
        el.append(h('button', { type: 'button', class: 'icon-btn img__x', 'aria-label': 'Dismiss', onclick: () => { pending.splice(pending.indexOf(tile), 1); drawImages(); } }, '×'));
        toast(`${file.name}: ${e.message}`, true);
      } finally { uploading--; }
      drawImages();
    }
  }
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  const drop = h('div', { class: 'drop' }, h('button', { type: 'button', class: 'btn btn--sm', onclick: () => fileInput.click() }, 'Add photos'), 'or drop files here. The first photo is the cover.', fileInput);
  drop.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('is-over'); } });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
  grid.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  grid.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

  /* save / delete */
  const saveBtn = h('button', { type: 'button', class: 'btn btn--primary' }, 'Save');
  async function save() {
    if (!d.name.trim()) { toast('Give the product a name first.', true); name.focus(); return; }
    if (uploading) { toast('Wait for the uploads to finish.', true); return; }
    if (!condition.reportValidity()) return;
    conditionNotes.setCustomValidity(conditionNotes.value.trim() ? '' : 'Please describe the condition of this garment.');
    if (!conditionNotes.reportValidity()) return;
    for (const { input } of measurementInputs) {
      if (!input.reportValidity()) return;
    }
    if (htmlMode) d.description = src.value;
    saveBtn.disabled = true;
    try {
      const body = { ...d, price: Number(d.price) || 0 };
      const saved = isNew && !slug
        ? await api('/admin/products', { method: 'POST', body })
        : await api('/admin/products/' + encodeURIComponent(slug), { method: 'PUT', body });
      if (saved.condition !== d.condition || saved.conditionNotes !== d.conditionNotes.trim()) {
        if (isNew) slug = saved.slug;
        throw new Error('Condition was not saved. The backend needs the latest update.');
      }
      // An older Worker drops unknown fields. Never report those measurements as saved.
      if (MEASUREMENT_FIELDS.some(([key]) => d.measurements[key] !== undefined && saved.measurements?.[key] !== d.measurements[key])) {
        if (isNew) slug = saved.slug;
        throw new Error('Measurements were not saved. The Cloudflare backend needs the latest update.');
      }
      for (const u of removedOurs.splice(0)) api('/admin/images', { method: 'DELETE', body: { url: u } }).catch(() => {});
      const i = products.findIndex((p) => p.slug === saved.slug);
      if (i >= 0) products[i] = saved; else products.push(saved);
      if (viewLink) viewLink.href = '../' + createProductRoutes(products).urlFor(saved.slug);
      setDirty(false); toast('Saved');
      if (isNew) { location.hash = '#/products/' + encodeURIComponent(saved.slug); return; }
      Object.assign(d, saved); refreshPreview();
    } catch (e) { toast(e.message, true); }
    saveBtn.disabled = false;
  }
  saveBtn.addEventListener('click', save);
  saveFn = save;
  const delBtn = isNew ? '' : h('button', { type: 'button', class: 'btn btn--danger', onclick: async () => {
    if (!(await confirmDialog({ title: 'Delete this product?', text: `"${d.name}" will be removed from the shop. This cannot be undone.`, ok: 'Delete', danger: true }))) return;
    try {
      await api('/admin/products/' + encodeURIComponent(slug), { method: 'DELETE' });
      products = products.filter((p) => p.slug !== slug); setDirty(false); toast('Product deleted'); location.hash = '#/products';
    } catch (e) { toast(e.message, true); }
  } }, 'Delete');
  const viewLink = isNew ? '' : h('a', { class: 'btn', href: '../' + createProductRoutes(products).urlFor(slug), target: '_blank', rel: 'noopener' }, 'View on site ↗');

  const field = (label, ctrl, cls) => h('label', { class: 'field' + (cls ? ' ' + cls : '') }, h('span', {}, label), ctrl);
  $('#view').replaceChildren(
    h('p', { style: 'margin-bottom:14px' }, h('a', { class: 'back', href: '#/products' }, '← All products')),
    h('div', { class: 'editor' },
      h('div', {},
        h('datalist', { id: 'brand-list' }, brands.map((b) => h('option', { value: b }))),
        h('section', { class: 'panel' }, h('h2', {}, 'Details'),
          field('Name', name),
          h('div', { class: 'grid2' }, field('Brand', brand), field('Category', cat)),
          h('div', { class: 'grid2' }, field('Size', size), field('Price', h('span', { class: 'price-wrap', style: 'display:block' }, price))),
          field('Condition (required)', condition),
          field('Condition notes (required)', conditionNotes),
          h('p', { class: 'hint' }, 'Describe the actual garment. Distinguish intentional distressing from wear. Add a clear real detail photo for every flaw; check photo numbers after reordering.'),
          h('label', { class: 'switch' }, sold, 'Sold')),
        h('section', { class: 'panel' }, h('h2', {}, 'Description'), bar, rte, src),
        h('section', { class: 'panel' }, h('h2', {}, 'Measurements'),
          h('p', { class: 'measurement-help' }, 'Enter centimeters only. Inches are calculated automatically. Measure the garment flat; leave unavailable measurements blank.'),
          h('div', { class: 'grid2' }, measurementInputs.map(({ element }) => element))),
        h('section', { class: 'panel' }, h('h2', {}, 'Photos'), grid, drop)),
      h('div', { class: 'preview-wrap' }, h('div', { class: 'preview' }, h('p', { class: 'label' }, 'Preview in shop'), previewHost))),
    h('div', { class: 'savebar' }, saveBtn, h('span', { class: 'dirty' }, 'Unsaved changes'), h('span', { class: 'grow' }), viewLink, delBtn));
  refreshPreview(); drawImages();
  lastHash = location.hash;
  if (isNew) name.focus();
}

/* ---------- pages (generated form) ---------- */
async function viewPages(sectionKey) {
  if (!content) content = await fetchContent();
  const keys = Object.keys(content);
  const key = keys.includes(sectionKey) ? sectionKey : keys[0];
  setTitle('Pages');
  const label = (k) => SECTION_NAMES[k] || humanize(k);
  const touch = () => setDirty(true);

  const strCtl = (obj, k) => {
    const long = String(obj[k]).length > 80 || String(obj[k]).includes('\n');
    const el = long ? h('textarea', { rows: Math.min(10, Math.max(3, Math.ceil(String(obj[k]).length / 80))) }) : h('input', { type: 'text' });
    el.value = obj[k];
    el.addEventListener('input', () => { obj[k] = el.value; touch(); });
    return el;
  };
  const move = (arr, i, to, redraw) => { if (to < 0 || to >= arr.length) return; const [m] = arr.splice(i, 1); arr.splice(to, 0, m); touch(); redraw(); };
  const ctrls = (arr, i, redraw) => [
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(arr, i, i - 1, redraw) }, '↑'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', disabled: i === arr.length - 1, onclick: () => move(arr, i, i + 1, redraw) }, '↓'),
    h('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': 'Remove', onclick: () => { arr.splice(i, 1); touch(); redraw(); } }, '×'),
  ];
  const blankLike = (v) => Array.isArray(v) ? v.map(blankLike) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blankLike(x)])) : typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : '';
  const itemTitle = (it, i) => {
    const first = it && typeof it === 'object' ? Object.values(it).find((x) => typeof x === 'string' && x.trim()) : null;
    return `${i + 1}${first ? ' · ' + first.slice(0, 48) + (first.length > 48 ? '…' : '') : ''}`;
  };

  function renderField(obj, k, name) {
    const v = obj[k];
    if (Array.isArray(v)) return renderArray(v, name);
    if (v && typeof v === 'object') {
      return h('fieldset', { class: 'grp' }, h('legend', {}, name), Object.keys(v).map((c) => renderField(v, c, humanize(c))));
    }
    if (typeof v === 'boolean') {
      const c = h('input', { type: 'checkbox', checked: v }); c.addEventListener('change', () => { obj[k] = c.checked; touch(); });
      return h('label', { class: 'switch' }, c, name);
    }
    if (typeof v === 'number') {
      const i = h('input', { type: 'number', value: String(v) }); i.addEventListener('input', () => { obj[k] = Number(i.value); touch(); });
      return h('label', { class: 'field' }, h('span', {}, name), i);
    }
    return h('label', { class: 'field' }, h('span', {}, name), strCtl(obj, k));
  }
  function renderArray(arr, name) {
    const wrap = h('fieldset', { class: 'grp' });
    const kind = arr.length ? (Array.isArray(arr[0]) ? 'rows' : typeof arr[0] === 'object' ? 'objects' : 'strings') : 'strings';
    const draw = () => {
      wrap.replaceChildren(h('legend', {}, name));
      arr.forEach((it, i) => {
        if (kind === 'strings') {
          const long = String(it).length > 80;
          const el = long ? h('textarea', { rows: 3, 'aria-label': `${name} ${i + 1}` }) : h('input', { type: 'text', 'aria-label': `${name} ${i + 1}` });
          el.value = it; el.addEventListener('input', () => { arr[i] = el.value; touch(); });
          wrap.append(h('div', { class: 'srow' }, el, ctrls(arr, i, draw)));
        } else if (kind === 'rows') {
          wrap.append(h('div', { class: 'rows' }, h('div', { class: 'srow' }, it.map((cell, c) => {
            const el = h('input', { type: 'text', 'aria-label': `Row ${i + 1} column ${c + 1}` }); el.value = cell;
            el.addEventListener('input', () => { it[c] = el.value; touch(); }); return el;
          }), ctrls(arr, i, draw))));
        } else {
          wrap.append(h('div', { class: 'item' },
            h('div', { class: 'item__head' }, h('h3', {}, itemTitle(it, i)), ctrls(arr, i, draw)),
            Object.keys(it).map((c) => renderField(it, c, humanize(c)))));
        }
      });
      wrap.append(h('button', { type: 'button', class: 'btn btn--sm addbtn', onclick: () => {
        arr.push(arr.length ? blankLike(arr[arr.length - 1]) : ''); touch(); draw();
        wrap.querySelector('.srow:last-of-type input, .item:last-of-type input, .item:last-of-type textarea')?.focus();
      } }, kind === 'strings' ? '+ Add' : kind === 'rows' ? '+ Add row' : '+ Add item'));
    };
    draw();
    return wrap;
  }

  const form = h('div', {});
  const sectionVal = content[key];
  if (sectionVal && typeof sectionVal === 'object' && !Array.isArray(sectionVal)) Object.keys(sectionVal).forEach((c) => form.append(renderField(sectionVal, c, humanize(c))));
  else form.append(renderField(content, key, label(key)));

  const saveBtn = h('button', { type: 'button', class: 'btn btn--primary' }, 'Save all pages');
  async function save() {
    saveBtn.disabled = true;
    try { await api('/admin/content', { method: 'PUT', body: content }); setDirty(false); toast('Saved'); }
    catch (e) { toast(e.message, true); }
    saveBtn.disabled = false;
  }
  saveBtn.addEventListener('click', save); saveFn = save;

  $('#view').replaceChildren(
    h('div', { class: 'pages' },
      h('nav', { class: 'plinks', 'aria-label': 'Sections' }, keys.map((k) => h('button', { type: 'button', class: k === key ? 'is-active' : '', onclick: () => { location.hash = '#/pages/' + encodeURIComponent(k); } }, label(k)))),
      h('div', {}, h('h1', { style: 'margin-bottom:16px' }, label(key)), form,
        h('div', { class: 'savebar' }, saveBtn, h('span', { class: 'dirty' }, 'Unsaved changes'), h('span', { class: 'grow' }), h('span', { class: 'count' }, 'Saves every section at once')))));
  lastHash = location.hash;
  setDirty(dirty);
}
async function fetchContent() {
  const r = await fetch(base() + '/public/content', { cache: 'no-store' });
  if (!r.ok) throw new ApiError(r.status, 'Could not load the page texts');
  return r.json();
}

boot();
