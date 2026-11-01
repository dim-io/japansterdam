// Generates api/.seed.sql from ../data/*.json (+ optional user upsert).
// Usage: SEED_USER=sam SEED_NAME=Sam SEED_PASSWORD=... node scripts/seed.mjs [--content-only]
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const now = Date.now();
const contentOnly = process.argv.includes('--content-only');

const products = JSON.parse(readFileSync(join(root, 'data', 'products.json'), 'utf8'));
const content = JSON.parse(readFileSync(join(root, 'data', 'content.json'), 'utf8'));

const sql = ['DELETE FROM products;', 'DELETE FROM content;'];
products.forEach((p, i) => {
  sql.push(`INSERT INTO products (slug, data, position, updated_at) VALUES (${q(p.slug)}, ${q(JSON.stringify(p))}, ${i}, ${now});`);
});
sql.push(`INSERT INTO content (id, data, updated_at) VALUES ('main', ${q(JSON.stringify(content))}, ${now});`);

if (!contentOnly) {
  const { SEED_USER, SEED_NAME, SEED_PASSWORD } = process.env;
  if (!SEED_USER || !SEED_NAME || !SEED_PASSWORD) {
    console.error('Set SEED_USER, SEED_NAME and SEED_PASSWORD (or pass --content-only).');
    process.exit(1);
  }
  const iterations = 100000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SEED_PASSWORD), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  const b64 = (buf) => Buffer.from(buf).toString('base64');
  sql.push(
    `INSERT INTO users (username, display_name, password_hash, password_salt, iterations, created_at, updated_at) VALUES (${q(SEED_USER.trim())}, ${q(SEED_NAME.trim())}, ${q(b64(bits))}, ${q(b64(salt))}, ${iterations}, ${now}, ${now}) ` +
      `ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name, password_hash=excluded.password_hash, password_salt=excluded.password_salt, iterations=excluded.iterations, updated_at=excluded.updated_at;`
  );
  // a new password invalidates old sessions
  sql.push(`DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ${q(SEED_USER.trim())});`);
}

writeFileSync(join(here, '..', '.seed.sql'), sql.join('\n') + '\n');
console.log(`Wrote .seed.sql: ${products.length} products, content${contentOnly ? '' : ', user ' + process.env.SEED_USER.trim()}.`);
