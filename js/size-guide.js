const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paragraphs=text=>String(text||'').split(/\n\s*\n/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('');
function diagrams(section){
 return `<div class="sg-diagrams">
  <figure><svg viewBox="0 0 240 240" aria-hidden="true" focusable="false"><path d="M90 30 68 24 20 65 42 103 66 87V210H174V87L198 103 220 65 172 24 150 30Q120 60 90 30Z"/><path class="sg-measure-line" d="M66 87H174m-108-6v12m108-12v12"/></svg><figcaption>${esc(section.topCaption)}</figcaption></figure>
  <figure><svg viewBox="0 0 240 240" aria-hidden="true" focusable="false"><path d="M60 18H180L190 220H135L120 105 105 220H50Z"/><path d="M59 34H181M120 18V65"/><path class="sg-measure-line" d="M60 18H180m-120-6v12m120-12v12M120 105 135 220m-21-114 12-2m3 117 12-2"/></svg><figcaption>${esc(section.bottomCaption)}</figcaption></figure>
 </div>`;
}
export function renderSizeGuide(s={}){
 const sections=Array.isArray(s.sections)?s.sections:[];
 return `<div class="page page--text page--size"><div class="wrap">
 <h1 class="page-title">${esc(s.title||'Size Guide')}</h1>
 ${sections.length?`<p class="lead">${esc(s.intro)}</p>${s.statement?`<p class="sg-statement">${esc(s.statement)}</p>`:''}`:'<p class="lead">Use the measurements on each product page to compare the fit.</p>'}
 ${sections.map((section,index)=>`<section class="block" aria-labelledby="sg-heading-${index}"><h2 id="sg-heading-${index}">${esc(section.heading)}</h2>${section.example?`<p class="sg-example">${esc(section.example)}</p>`:''}${paragraphs(section.body)}
 ${section.diagram==='garments'?diagrams(section):''}
 ${section.measurements?.length?`<dl class="sg-methods">${section.measurements.map(m=>`<div><dt>${esc(m.label)}</dt><dd>${esc(m.body)}</dd></div>`).join('')}</dl>`:''}</section>`).join('')}
 ${s.contactText?`<p class="sg-contact">${esc(s.contactText)} <a class="u" href="contact.html">${esc(s.contactLabel||'Ask us about a piece')}</a></p>`:''}
 </div></div>`;
}
