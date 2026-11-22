// Public company identity, shared by Contact, checkout and the footer.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function businessDetailsHTML(b = {}, id = 'business-details') {
  const rows = [['Company', b.company], ['Registered address', b.address], ['KvK', b.kvk], ['VAT ID', b.vat], ['Email', b.email], ['Telephone', b.phone]];
  const details = rows.filter(([,value]) => typeof value === 'string' && value.trim()).map(([label,value]) => {
    const text = esc(value.trim());
    const link = label === 'Email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? 'mailto:' + value.trim() : label === 'Telephone' && /^\+?[\d ()-]+$/.test(value.trim()) ? 'tel:' + value.replace(/[^+\d]/g, '') : '';
    return `<div><dt>${label}</dt><dd>${link ? `<a href="${esc(link)}">${text}</a>` : text}</dd></div>`;
  }).join('');
  return details ? `<section class="business-details" id="${esc(id)}" aria-labelledby="${esc(id)}-title"><h2 id="${esc(id)}-title">Business details</h2><dl>${details}</dl></section>` : '';
}
export function businessFooterHTML(b = {}) {
  return `<div class="ft__bottom"><p>© 2026 ${esc(b.company || 'Japansterdam')} · Amsterdam</p>${b.kvk || b.vat ? `<p>${[b.kvk ? 'KvK ' + esc(b.kvk) : '', b.vat ? 'VAT ' + esc(b.vat) : ''].filter(Boolean).join(' · ')}</p>` : ''}<a class="ft-link" href="contact.html#business-details">Contact &amp; business details</a></div>`;
}

// Only company identity belongs in page snapshots, never checkout settings.
export function publicBusiness(settings = {}) {
  const business = {};
  for (const key of ['company', 'kvk', 'vat', 'address', 'email', 'phone', 'returnAddress']) {
    if (typeof settings?.[key] === 'string') business[key] = settings[key].trim();
  }
  return business;
}
