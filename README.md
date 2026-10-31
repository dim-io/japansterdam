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

## Editing later

Decap CMS can be added later to edit the JSON files in `data/` through GitHub, without touching the code.
