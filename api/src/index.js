// japansterdam-api: Cloudflare Worker (D1 + R2). No dependencies.

const CATEGORIES = ['Tops', 'Bottoms', 'Jackets & Outerwear', 'Sets', 'Accessories'];
const CONDITIONS = ['New / unworn', 'Excellent', 'Very good', 'Good', 'Fair'];
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_FAILS = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const ITERATIONS = 100000; // Workers WebCrypto maximum
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_CONTENT = 200 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- helpers ----------
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sha256hex = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function verifyPassword(user, password) {
  const got = await pbkdf2(password, unb64(user.password_salt), user.iterations);
  return safeEqual(got, unb64(user.password_hash));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return { hash: b64(hash), salt: b64(salt), iterations: ITERATIONS };
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = new Headers({ Vary: 'Origin' });
  if (origin && allowed.includes(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    h.set('Access-Control-Max-Age', '86400');
  }
  return h;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } });
}

async function readJson(request, maxBytes = MAX_CONTENT + 1024) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

async function audit(env, userId, action, target) {
  await env.DB.prepare('INSERT INTO audit (user_id, action, target, ts) VALUES (?, ?, ?, ?)')
    .bind(userId ?? null, action, target ?? null, Date.now()).run();
}

// ---------- HTML sanitizer ----------
const ALLOWED_TAGS = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'a']);
const TAG_ALIAS = { b: 'strong', i: 'em', div: 'p' };
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math']);

function escText(s) { return s.replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Math.min(parseInt(d, 10), 0x10ffff)))
    .replace(/&colon;/gi, ':').replace(/&tab;/gi, '\t').replace(/&newline;/gi, '\n')
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}
function safeHref(raw) {
  const v = decodeEntities(raw).replace(/[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, '');
  if (!v) return null;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return decodeEntities(raw).trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null; // javascript:, data:, vbscript: ...
  return decodeEntities(raw).trim(); // relative URL or #anchor
}

export function sanitizeHtml(input) {
  const html = String(input ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</g;
  const out = [];
  const open = []; // stack of emitted tags
  let dropDepth = null; // name of dropped container
  let m;
  while ((m = re.exec(html))) {
    if (m[2] === undefined) {
      if (dropDepth) continue;
      out.push(m[0] === '<' ? '&lt;' : escText(m[0]));
      continue;
    }
    const closing = m[1] === '/';
    let name = m[2].toLowerCase();
    if (dropDepth) {
      if (closing && name === dropDepth) dropDepth = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) { if (!closing) dropDepth = name; continue; }
    name = TAG_ALIAS[name] || name;
    if (!ALLOWED_TAGS.has(name)) continue;
    if (name === 'br') { if (!closing) out.push('<br>'); continue; }
    if (closing) {
      const idx = open.lastIndexOf(name);
      if (idx === -1) continue;
      while (open.length > idx) out.push(`</${open.pop()}>`);
      continue;
    }
    if (name === 'a') {
      const hm = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(m[3] || '');
      const href = hm ? safeHref(hm[1] ?? hm[2] ?? hm[3] ?? '') : null;
      if (!href) continue; // drop anchor without safe href (its text stays)
      out.push(`<a href="${escAttr(href)}">`);
      open.push('a');
      continue;
    }
    out.push(`<${name}>`);
    open.push(name);
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('');
}

// ---------- product validation ----------
function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '') || 'item';
}

function cleanProduct(input, slug, addedOn) {
  if (!isObj(input)) throw new HttpError(400, 'Product must be an object');
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = str(input.name);
  if (!name) throw new HttpError(400, 'Name is required');
  if (name.length > 200) throw new HttpError(400, 'Name is too long');
  const category = str(input.category);
  if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Category must be one of: ' + CATEGORIES.join(', '));
  const price = typeof input.price === 'string' && input.price.trim() !== '' ? Number(input.price) : input.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) throw new HttpError(400, 'Price must be a number of 0 or more');
  if (input.sold !== undefined && typeof input.sold !== 'boolean') throw new HttpError(400, 'Sold must be true or false');
  if (input.description !== undefined && typeof input.description !== 'string') throw new HttpError(400, 'Description must be a string');
  const images = input.images ?? [];
  if (!Array.isArray(images) || images.length > 40 || images.some((i) => typeof i !== 'string' || !i.trim() || i.length > 600)) {
    throw new HttpError(400, 'Images must be a list of up to 40 URLs');
  }
  if (input.active !== undefined && typeof input.active !== 'boolean') throw new HttpError(400, 'Active must be true or false');
  const active = input.active !== false;
  if (input.imageFrames !== undefined && (!Array.isArray(input.imageFrames) || input.imageFrames.length > 40)) throw new HttpError(400, 'Invalid photo frames');
  const imageFrames = (input.imageFrames || []).map((frame) => {
    if (!isObj(frame) || !images.includes(frame.url) || !['cover', 'contain'].includes(frame.fit) ||
      ![frame.x, frame.y].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)) throw new HttpError(400, 'Invalid photo frame');
    return { url: frame.url.trim(), fit: frame.fit, x: frame.x, y: frame.y };
  });
  const brand = str(input.brand);
  const size = str(input.size);
  const fitSizes = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'One size'];
  if (input.fitsLike !== undefined && (!Array.isArray(input.fitsLike) || input.fitsLike.length > fitSizes.length || input.fitsLike.some(value => !fitSizes.includes(value)))) {
    throw new HttpError(400, 'Fits like must be a list of standard sizes: ' + fitSizes.join(', '));
  }
  const label = size.toUpperCase();
  const suggestions = /^(ONE[ -]?SIZE|O[ /]?S|FREE(?: SIZE)?)$/.test(label) ? ['One size']
    : (label.match(/\b(?:XXXS|XXS|XS|XXXL|XXL|XL|3XL|2XL|S|M|L)\b/g) || []).map(value => value === 'XXXL' ? '3XL' : value === '2XL' ? 'XXL' : value);
  const fitsLike = fitSizes.filter(value => (input.fitsLike ?? suggestions).includes(value));
  const condition = str(input.condition);
  const conditionNotes = str(input.conditionNotes);
  if ((active || condition) && !CONDITIONS.includes(condition)) throw new HttpError(400, 'Choose a condition: ' + CONDITIONS.join(', '));
  if (active && !conditionNotes) throw new HttpError(400, 'Condition notes are required. Describe wear, flaws or the absence of visible flaws.');
  if (conditionNotes.length > 600) throw new HttpError(400, 'Condition notes must be 600 characters or fewer');
  const topKeys = ['chest', 'shoulder', 'sleeveLength', 'length', 'hem'];
  const bottomKeys = ['waist', 'hip', 'inseam', 'outseam', 'frontRise', 'backRise', 'thigh', 'legOpening'];
  const cleanMeasurements = (values, keys, prefix = '') => {
    if (values !== undefined && !isObj(values)) throw new HttpError(400, prefix + 'Measurements must be an object');
    const result = {};
    for (const key of keys) {
      const value = values?.[key];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 1000) {
        throw new HttpError(400, prefix + key + ' must be a measurement in centimeters between 0.1 and 1000');
      }
      result[key] = value;
    }
    return result;
  };
  const measurements = cleanMeasurements(input.measurements, [...topKeys, ...bottomKeys]);
  if (input.measurements?.bottom !== undefined) {
    measurements.bottom = cleanMeasurements(input.measurements.bottom, bottomKeys, 'Bottoms: ');
  }
  return {
    slug,
    name,
    title: size ? `${name} - Size ${size}` : name,
    brand,
    brands: brand ? [brand] : [],
    category,
    size,
    fitsLike,
    condition,
    conditionNotes,
    sizeTags: size ? [size] : [],
    price,
    currency: 'EUR',
    sold: input.sold === true,
    active,
    imageFrames,
    addedOn,
    description: sanitizeHtml(input.description || ''),
    images: images.map((i) => i.trim()),
    measurements,
  };
}

// ---------- auth ----------
async function authenticate(request, env) {
  const m = /^Bearer\s+([0-9a-f]{64})$/i.exec(request.headers.get('Authorization') || '');
  if (!m) throw new HttpError(401, 'Not logged in');
  const tokenHash = await sha256hex(m[1].toLowerCase());
  const row = await env.DB.prepare(
    'SELECT u.id, u.username, u.display_name, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
  ).bind(tokenHash, Date.now()).first();
  if (!row) throw new HttpError(401, 'Not logged in');
  return { id: row.id, username: row.username, displayName: row.display_name, tokenHash: row.token_hash };
}
const publicUser = (u) => ({ username: u.username, displayName: u.displayName });

async function login(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const now = Date.now();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ts > ?').bind(ip, now - FAIL_WINDOW_MS).first();
  if (n >= MAX_FAILS) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
  const body = await readJson(request);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const user = username ? await env.DB.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').bind(username).first() : null;
  let ok = false;
  if (user) ok = await verifyPassword(user, password);
  else await pbkdf2(password, new Uint8Array(16), ITERATIONS); // equalise timing
  if (!ok) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO login_attempts (ip, ts) VALUES (?, ?)').bind(ip, now),
      env.DB.prepare('DELETE FROM login_attempts WHERE ts < ?').bind(now - FAIL_WINDOW_MS),
    ]);
    throw new HttpError(401, 'Wrong name or password');
  }
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256hex(token), user.id, now, now + SESSION_MS),
    env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
  ]);
  await audit(env, user.id, 'login', user.username);
  return json({ token, user: { username: user.username, displayName: user.display_name } });
}

// ---------- routes ----------
async function listProducts(env) {
  const { results } = await env.DB.prepare('SELECT data FROM products ORDER BY position ASC, updated_at ASC').all();
  return results.map((r) => JSON.parse(r.data));
}

async function uniqueSlug(env, name) {
  const base = slugify(name);
  for (let i = 1; i < 200; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    if (!(await env.DB.prepare('SELECT 1 FROM products WHERE slug = ?').bind(s).first())) return s;
  }
  return base + '-' + hex(crypto.getRandomValues(new Uint8Array(3)));
}

function sniffImage(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return ['image/png', 'png'];
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return ['image/webp', 'webp'];
  return null;
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  const seg = path.split('/').filter(Boolean);

  // public
  if (method === 'GET' && path === '/public/products') {
    return json((await listProducts(env)).filter((p) => p.active !== false), 200, { 'Cache-Control': 'no-store' });
  }
  if (method === 'GET' && path === '/public/content') {
    const row = await env.DB.prepare("SELECT data FROM content WHERE id = 'main'").first();
    if (!row) throw new HttpError(404, 'No content yet');
    return new Response(row.data, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' } });
  }
  if (method === 'GET' && seg[0] === 'img' && seg.length > 1) {
    const key = decodeURIComponent(seg.slice(1).join('/'));
    if (!key.startsWith('products/') || key.includes('..')) throw new HttpError(404, 'Not found');
    const { value, metadata } = await env.IMAGES.getWithMetadata(key, { type: 'stream' });
    if (!value) throw new HttpError(404, 'Not found');
    const h = new Headers();
    h.set('Content-Type', (metadata && metadata.contentType) || 'application/octet-stream');
    h.set('Cache-Control', 'public, max-age=31536000, immutable');
    h.set('Cross-Origin-Resource-Policy', 'cross-origin');
    h.set('X-Content-Type-Options', 'nosniff');
    return new Response(value, { headers: h });
  }

  if (method === 'POST' && path === '/auth/login') return login(request, env);

  // authenticated
  if (seg[0] === 'auth' || seg[0] === 'admin') {
    const user = await authenticate(request, env);

    if (path === '/auth/me' && method === 'GET') return json({ user: publicUser(user) });
    if (path === '/auth/logout' && method === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.tokenHash).run();
      await audit(env, user.id, 'logout', user.username);
      return json({ ok: true });
    }
    if (path === '/auth/profile' && method === 'PATCH') {
      const b = await readJson(request);
      const name = typeof b?.displayName === 'string' ? b.displayName.trim() : '';
      if (!name || name.length > 60) throw new HttpError(400, 'Display name must be 1 to 60 characters');
      await env.DB.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').bind(name, Date.now(), user.id).run();
      await audit(env, user.id, 'profile.update', user.username);
      return json({ user: { username: user.username, displayName: name } });
    }
    if (path === '/auth/password' && method === 'POST') {
      const b = await readJson(request);
      const cur = typeof b?.currentPassword === 'string' ? b.currentPassword : '';
      const next = typeof b?.newPassword === 'string' ? b.newPassword : '';
      if (next.length < 4) throw new HttpError(400, 'New password must be at least 4 characters');
      if (next.length > 200) throw new HttpError(400, 'New password is too long');
      const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
      if (!(await verifyPassword(row, cur))) throw new HttpError(403, 'Current password is wrong');
      const h = await hashPassword(next);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, iterations = ?, updated_at = ? WHERE id = ?').bind(h.hash, h.salt, h.iterations, Date.now(), user.id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, user.tokenHash),
      ]);
      await audit(env, user.id, 'password.change', user.username);
      return json({ ok: true });
    }

    if (seg[0] === 'admin') {
      if (path === '/admin/products' && method === 'GET') return json(await listProducts(env));

      if (path === '/admin/products' && method === 'POST') {
        const b = await readJson(request);
        const name = typeof b?.name === 'string' ? b.name.trim() : '';
        if (!name) throw new HttpError(400, 'Name is required');
        const slug = await uniqueSlug(env, name);
        const product = cleanProduct(b, slug, Date.now());
        // Preserve the owner's curated opening selection when adding a garment.
        const max = await env.DB.prepare('SELECT MAX(position) AS m FROM products').first();
        const pos = (max?.m ?? -1) + 1;
        await env.DB.prepare('INSERT INTO products (slug, data, position, updated_at) VALUES (?, ?, ?, ?)').bind(slug, JSON.stringify(product), pos, Date.now()).run();
        await audit(env, user.id, 'product.create', slug);
        return json(product, 201);
      }

      if (path === '/admin/products/reorder' && method === 'POST') {
        const b = await readJson(request);
        if (!Array.isArray(b?.slugs) || b.slugs.some((s) => typeof s !== 'string')) throw new HttpError(400, 'slugs must be a list');
        const existing = (await env.DB.prepare('SELECT slug FROM products ORDER BY position ASC').all()).results.map((r) => r.slug);
        const known = new Set(existing);
        const given = [...new Set(b.slugs)].filter((s) => known.has(s));
        const givenSet = new Set(given);
        const order = [...given, ...existing.filter((s) => !givenSet.has(s))];
        const now = Date.now();
        await env.DB.batch(order.map((s, i) => env.DB.prepare('UPDATE products SET position = ?, updated_at = ? WHERE slug = ?').bind(i, now, s)));
        await audit(env, user.id, 'product.reorder', String(order.length));
        return json({ ok: true, count: order.length });
      }

      if (seg[1] === 'products' && seg.length === 3) {
        const slug = decodeURIComponent(seg[2]);
        if (method === 'PUT') {
          const row = await env.DB.prepare('SELECT data FROM products WHERE slug = ?').bind(slug).first();
          if (!row) throw new HttpError(404, 'Product not found');
          const old = JSON.parse(row.data);
          const input = await readJson(request);
          // Older editor tabs may not send the new field; only an explicit {} clears it.
          if (isObj(input) && input.measurements === undefined) input.measurements = old.measurements;
          if (isObj(input) && input.condition === undefined) input.condition = old.condition;
          if (isObj(input) && input.conditionNotes === undefined) input.conditionNotes = old.conditionNotes;
          if (isObj(input) && input.active === undefined) input.active = old.active;
          if (isObj(input) && input.imageFrames === undefined) input.imageFrames = (old.imageFrames || []).filter((f) => (input.images || []).includes(f.url));
          const product = cleanProduct(input, slug, old.addedOn || Date.now());
          await env.DB.prepare('UPDATE products SET data = ?, updated_at = ? WHERE slug = ?').bind(JSON.stringify(product), Date.now(), slug).run();
          await audit(env, user.id, 'product.update', slug);
          return json(product);
        }
        if (method === 'DELETE') {
          const r = await env.DB.prepare('DELETE FROM products WHERE slug = ?').bind(slug).run();
          if (!r.meta.changes) throw new HttpError(404, 'Product not found');
          await audit(env, user.id, 'product.delete', slug);
          return json({ ok: true });
        }
      }

      if (path === '/admin/content' && method === 'PUT') {
        const text = await request.text();
        if (new TextEncoder().encode(text).length > MAX_CONTENT) throw new HttpError(413, 'Content is larger than 200 KB');
        let data;
        try { data = JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON'); }
        if (!isObj(data)) throw new HttpError(400, 'Content must be a JSON object');
        const now = Date.now();
        await env.DB.prepare("INSERT INTO content (id, data, updated_at) VALUES ('main', ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").bind(JSON.stringify(data), now).run();
        await audit(env, user.id, 'content.update', 'main');
        return json({ ok: true, updatedAt: now });
      }

      if (path === '/admin/images' && method === 'POST') {
        let form;
        try { form = await request.formData(); } catch { throw new HttpError(400, 'Expected multipart form data'); }
        const file = form.get('file');
        if (!file || typeof file === 'string') throw new HttpError(400, 'Missing file');
        if (file.size > MAX_IMAGE) throw new HttpError(413, 'Image is larger than 8 MB');
        const buf = await file.arrayBuffer();
        const kind = sniffImage(new Uint8Array(buf.slice(0, 12)));
        if (!kind || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type || kind[0])) throw new HttpError(415, 'Only JPEG, PNG or WebP images');
        const key = `products/${crypto.randomUUID()}.${kind[1]}`;
        await env.IMAGES.put(key, buf, { metadata: { contentType: kind[0] } });
        await audit(env, user.id, 'image.upload', key);
        return json({ url: `${url.origin}/img/${key}` }, 201);
      }
      if (path === '/admin/images' && method === 'DELETE') {
        const b = await readJson(request);
        let u;
        try { u = new URL(String(b?.url)); } catch { throw new HttpError(400, 'Invalid url'); }
        const m = /^\/img\/(products\/[0-9a-f-]+\.(?:jpg|png|webp))$/.exec(u.pathname);
        if (u.origin !== url.origin || !m) throw new HttpError(400, 'Not one of our images');
        await env.IMAGES.delete(m[1]);
        await audit(env, user.id, 'image.delete', m[1]);
        return json({ ok: true });
      }
    }
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      res = await handle(request, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) res = json({ error: e.message }, e.status);
      else { console.error(e); res = json({ error: 'Something went wrong' }, 500); }
    }
    const out = new Response(res.body, res);
    for (const [k, v] of cors) out.headers.set(k, v);
    return out;
  },
};
