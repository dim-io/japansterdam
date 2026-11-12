// Shared by the HTML generator and interactive layout; no browser or API dependency.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderChrome(page = 'index.html') {
// Static defaults so the chrome renders at once; content.json refines them later (data-site hooks).
const site = {
  instagram: 'https://www.instagram.com/japansterdam',
  grailed: 'https://www.grailed.com/Japansterdam',
  substack: 'https://substack.com/japansterdam',
};

const ICON_INSTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".8" fill="currentColor" stroke="none"/></svg>';
const ICON_BAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>';

const NAV = [['Shop', 'shop.html'], ['Journal', 'journal.html'], ['About', 'about.html'], ['Contact', 'contact.html']];
const current = (href) => (page === href || (page === 'product.html' && href === 'shop.html') ? ' aria-current="page"' : '');
const navLinks = (cls = '') => NAV.map(([l, h]) => `<a href="${h}"${current(h)}>${l}</a>`).join('');

function headerHTML() {
  return `<div class="hdr">
  <div class="hdr__left">
    <button class="icon-btn hdr__burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="menu" data-open-menu>${ICON_MENU}</button>
    <nav class="hdr__nav" aria-label="Primary">${navLinks()}</nav>
  </div>
  <a class="hdr__logo" href="index.html" aria-label="Japansterdam, home"><img src="assets/img/site/header-logo.png" alt="Japansterdam" width="702" height="104"></a>
  <div class="hdr__tools">
    <a class="icon-btn hdr__insta" href="${esc(site.instagram)}" data-site="instagram" target="_blank" rel="noopener" aria-label="Instagram">${ICON_INSTA}</a>
    <a class="icon-btn hdr__grailed" href="${esc(site.grailed)}" data-site="grailed" target="_blank" rel="noopener" aria-label="Shop Japansterdam on Grailed" title="Shop Japansterdam on Grailed"><img src="assets/icons/grailed.png" width="22" height="22" alt=""></a>
    <button class="icon-btn" type="button" aria-label="Open bag" data-open-bag>${ICON_BAG}<span class="bag-count" data-bag-count hidden>0</span></button>
  </div>
</div>`;
}

function footerHTML() {
  const ext = (key, label) => `<a class="ft-link" href="${esc(site[key])}" data-site="${key}" target="_blank" rel="noopener">${label}</a>`;
  return `<div class="ft">
  <div class="ft__top">
    <div class="ft__brand"><a href="index.html" aria-label="Japansterdam, home"><img src="assets/img/site/footer-logo.jpg" alt="Japansterdam" width="1535" height="1024" loading="lazy"></a></div>
    <div class="ft__col"><h2>Help</h2><ul>
      <li><a class="ft-link" href="shipping-returns.html">Shipping &amp; Returns</a></li>
      <li><a class="ft-link" href="size-guide.html">Size Guide</a></li>
      <li><a class="ft-link" href="faq.html">FAQs</a></li></ul></div>
    <div class="ft__col"><h2>Company</h2><ul>
      <li><a class="ft-link" href="journal.html">Journal</a></li>
      <li><a class="ft-link" href="about.html">About</a></li>
      <li><a class="ft-link" href="contact.html">Contact</a></li>
      <li><a class="ft-link" href="privacy-policy.html">Privacy Policy</a></li></ul></div>
    <div class="ft__col"><h2>Follow</h2><ul>
      <li>${ext('instagram', 'Instagram')}</li>
      <li>${ext('grailed', 'Visit our Grailed shop ↗')}</li>
      <li>${ext('substack', 'Substack')}</li></ul></div>
  </div>
  <div class="ft__news">
    <p>Sign up to receive news and updates.</p>
    <a class="btn btn--light" href="${esc(site.substack)}" data-site="substack" target="_blank" rel="noopener">Subscribe on Substack</a>
  </div>
  <p class="ft__bottom">© 2026 Japansterdam · Amsterdam</p>
</div>`;
}


return { headerHTML, footerHTML, navLinks, ICON_CLOSE, site };
}
