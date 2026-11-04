// Renders about, contact, faq, shipping, size guide and privacy from data/content.json.
import './layout.js?v=grailed-links';
import { getContent, esc } from './data.js';

const c = await getContent();
const root = document.getElementById('page-root');
const kind = document.body.dataset.page;

const blocks = (sections) => sections.map((s) => `<section class="block"><h2>${esc(s.heading)}</h2><p>${esc(s.body)}</p></section>`).join('');

const views = {
  about() {
    const a = c.about;
    const paragraphs = a.paragraphs || [];
    const statement = a.closingQuote || paragraphs[0] || a.title;
    const body = !a.closingQuote && paragraphs.length ? paragraphs.slice(1) : paragraphs;
    return `<div class="page page--flush page--about"><div class="wrap">
  <div class="about">
    <div class="about__intro">
      <p class="eyebrow">${esc(a.title)}</p>
      <h1 class="display about__headline">${esc(statement)}</h1>
    </div>
    <figure class="about__img"><img src="assets/img/site/about-sam.jpg" alt="Sam, founder and curator of Japansterdam" width="1538" height="2000" fetchpriority="high"></figure>
    <div class="about__body">
      ${body.map((p) => `<p>${esc(p)}</p>`).join('')}
      <div class="about__signature">
        <img src="assets/img/site/sam-signature.webp" alt="" width="496" height="218" class="about__autograph">
        <p class="about__sig">${esc(a.signature)}</p>
      </div>
    </div>
  </div>
  <div class="about-pair">
    <figure class="about-pair__label"><img src="assets/img/site/about-label.jpg" alt="Close-up of a garment label with three red crosses" width="2000" height="1333" loading="lazy"></figure>
    <figure class="about-pair__atelier"><img src="assets/img/site/about-sewing.jpg" alt="Sewing machine in the workshop" width="2000" height="1333" loading="lazy"></figure>
  </div>
  </div>
  <section class="about-close" aria-label="Follow Japansterdam"><div class="wrap">
  <div class="insta"><p class="display" style="font-size:clamp(20px,2.4vw,32px)">Follow us on Instagram</p><a class="btn" href="${esc(c.site.instagram)}" target="_blank" rel="noopener">Instagram</a></div>
  </div></section></div>`;
  },
  contact() {
    const t = c.contact, mail = c.site.email;
    return `<div class="contact">
  <div class="contact__text">
    <h1 class="page-title">${esc(t.title)}</h1>
    <p class="intro">${esc(t.intro)}</p>
    <div><p class="contact__label">${esc(t.label)}</p><a class="contact__mail" href="mailto:${esc(mail)}">${esc(mail)}</a></div>
  </div>
  <div class="contact__img"><img src="assets/img/site/contact.jpg" alt="Hands holding a navy jacket" width="1600" height="2000" fetchpriority="high"></div>
</div>`;
  },
  shipping() {
    return `<div class="page page--text"><div class="wrap"><h1 class="page-title">${esc(c.shipping.title)}</h1>${blocks(c.shipping.sections)}</div></div>`;
  },
  privacy() {
    return `<div class="page page--text"><div class="wrap"><h1 class="page-title">${esc(c.privacy.title)}</h1>${blocks(c.privacy.sections)}</div></div>`;
  },
  faq() {
    return `<div class="page page--text"><div class="wrap"><h1 class="page-title">${esc(c.faq.title)}</h1>
<div class="faq">${c.faq.items.map((i) => `<details><summary>${esc(i.q)}</summary><p class="faq__a">${esc(i.a)}</p></details>`).join('')}</div></div></div>`;
  },
  size() {
    const s = c.sizeGuide;
    return `<div class="page page--text"><div class="wrap"><h1 class="page-title">${esc(s.title)}</h1>
<p class="lead">${esc(s.intro)}</p>
<div class="toggle" role="group" aria-label="Units"><button type="button" data-unit="in" aria-pressed="true">Inches</button><button type="button" data-unit="cm" aria-pressed="false">Centimetres</button></div>
${s.tables.map((t) => `<table class="sg-table"><caption>${esc(t.heading)}</caption><thead><tr>${t.columns.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((cell, i) => (i === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td data-in="${esc(cell)}">${esc(cell)}</td>`)).join('')}</tr>`).join('')}</tbody></table>`).join('')}
</div></div>`;
  },
};

root.innerHTML = (views[kind] || (() => ''))();

// inch -> cm toggle (whole centimetres)
if (kind === 'size') {
  const toCm = (txt) => {
    const cm = (n) => Math.round(parseFloat(n) * 2.54);
    if (!txt.includes('”')) return txt;
    return txt
      .replace(/(\d+(?:\.\d+)?)”\s*–\s*(\d+(?:\.\d+)?)”/g, (_, a, b) => `${cm(a)}–${cm(b)} cm`)
      .replace(/(\d+(?:\.\d+)?)”/g, (_, a) => `${cm(a)} cm`);
  };
  const btns = root.querySelectorAll('[data-unit]');
  btns.forEach((b) => b.addEventListener('click', () => {
    const cmMode = b.dataset.unit === 'cm';
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    root.querySelectorAll('td[data-in]').forEach((td) => { td.textContent = cmMode ? toCm(td.dataset.in) : td.dataset.in; });
  }));
}
