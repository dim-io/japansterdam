# Japansterdam

Static website for Japansterdam (pre-owned and archive Japanese menswear, Amsterdam). Plain HTML, one CSS file and vanilla JS modules. No framework, no build step, no npm. All URLs are relative, so it works under a subpath such as https://dim-io.github.io/japansterdam/.

## Run locally

```
python3 -m http.server 8080
```

Then open http://localhost:8080/. (Opening the files directly from disk does not work, because the pages fetch JSON.)

## Where things live

- `data/content.json` holds all page copy. `data/products.json` holds the products. Edit these files to change the site.
- `js/layout.js` is the single source for header, footer, menu and bag drawer.
- `js/data.js` loads the JSON and has shared helpers. `js/bag.js` keeps the bag in localStorage (`jp_bag`).
- Each page loads its own module: `home.js`, `shop.js`, `product.js`, `checkout.js`, `pages.js` (about, contact, FAQ, shipping, size guide, privacy).
- `404.html` sets `<base href="/japansterdam/">`; change it if the site moves to another path or domain root.
- There is no payment provider yet: checkout opens an email with the order request.

## CMS and backend

The shop owner edits products and page texts at `/admin/` (login with name and password). Architecture:

- `api/` is a Cloudflare Worker (`japansterdam-api`, plain JS, no dependencies besides `wrangler`) with a D1 database (`DB`: users, sessions, products, content, audit log) and a KV namespace (`IMAGES`: uploaded product photos; R2 is not enabled on this account).
- The public site (GitHub Pages) reads `GET /public/products` and `GET /public/content` from the Worker when `API_BASE` in `js/config.js` is set. If the request fails or takes longer than 4 seconds it falls back to `data/*.json`. With `API_BASE = ""` the site is fully static as before.
- The admin (`admin/index.html`, `admin.js`, `admin.css`) runs on GitHub Pages and talks to the Worker with `Authorization: Bearer <token>` (no cookies, because the admin is on a different site than the Worker). The token is kept in localStorage (`jp_admin_token`); only its SHA-256 hash is stored on the server, sessions last 30 days.
- Passwords: PBKDF2-SHA256, 100000 iterations (the Workers maximum), random salt. Login is rate limited to 8 failed attempts per IP per 15 minutes. Changing the password needs only 4 characters, but a longer one is advised.
- Product descriptions are sanitized on the server to `p, ul, ol, li, strong, em, br, a[href]`.
- The static `data/*.json` files remain the fallback and the seed source. Changes made in the admin live in D1, not in these files.

### Run locally

```
cd api
npm install
npx wrangler d1 migrations apply japansterdam --local
SEED_USER=sam SEED_NAME=Sam SEED_PASSWORD='choose-one' node scripts/seed.mjs
npx wrangler d1 execute japansterdam --local --file .seed.sql
npx wrangler dev --port 8787
```

Then set `API_BASE = "http://localhost:8787"` in `js/config.js` and run `python3 -m http.server 8080` in the project root. Open http://localhost:8080/admin/. CORS allows `localhost:8080`, `127.0.0.1:8080` and `https://dim-io.github.io` (var `ALLOWED_ORIGINS` in `api/wrangler.toml`).

### Seed

`api/scripts/seed.mjs` writes `api/.seed.sql` (git-ignored) from `data/products.json` and `data/content.json` and upserts one user. The name, display name and password come only from the env vars `SEED_USER`, `SEED_NAME`, `SEED_PASSWORD`. Seeding replaces all products and content. Add `--content-only` to skip the user. Run the generated file with `npx wrangler d1 execute japansterdam --local --file .seed.sql` or `--remote`. Delete `.seed.sql` afterwards.

### Deploy

```
cd api
npx wrangler login
npx wrangler d1 create japansterdam          # copy the database_id into api/wrangler.toml
npx wrangler kv namespace create IMAGES   # put the id in wrangler.toml
npx wrangler d1 migrations apply japansterdam --remote
SEED_USER=sam SEED_NAME=Sam SEED_PASSWORD='choose-one' node scripts/seed.mjs
npx wrangler d1 execute japansterdam --remote --file .seed.sql
npx wrangler deploy
```

Then put the Worker URL (for example `https://japansterdam-api.<account>.workers.dev`, no trailing slash) in `API_BASE` in `js/config.js` and push the site. Product photos uploaded in the admin are stored in KV and served from `<worker>/img/products/...`; existing photos in `assets/img/products/` keep working.
