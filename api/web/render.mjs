import { responsiveAttrs } from '../../js/responsive-images.js';
import { createProductRoutes } from '../../js/product-urls.js';
import { imageFrameStyle } from '../../js/image-frames.js';
import { productFitsLike } from '../../js/sizing.js';
import { measurementGroups, formatMeasurement } from '../../js/measurements.js';
import { brandPage } from '../../js/brand-pages.js';
import { matchesBrand } from '../../js/brands.js';
export const ORIGIN='https://japansterdam.com/';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const money=n=>'€'+Math.round(Number(n)).toLocaleString('en-US');
export function productMeta(p,url){
 const hasBrand=String(p.name).toLowerCase().includes(String(p.brand).toLowerCase());
 return {title:p.name+(hasBrand?'':' — '+p.brand)+' — Japansterdam',description:`${p.name}. Size ${p.size}. ${money(p.price)}. ${p.condition}. ${p.conditionNotes||''}`.slice(0,180),url,image:new URL(p.images[0],ORIGIN).href};
}
export function productSchema(p,url){return {'@context':'https://schema.org','@type':'Product',name:p.name,brand:{'@type':'Brand',name:p.brand},category:p.category,size:p.size,description:plain(p.description),image:p.images.map(i=>new URL(i,ORIGIN).href),offers:{'@type':'Offer',url,price:Number(p.price).toFixed(2),priceCurrency:'EUR',itemCondition:p.condition==='New / unworn'?'https://schema.org/NewCondition':'https://schema.org/UsedCondition',availability:p.sold?'https://schema.org/SoldOut':'https://schema.org/InStock'}};}
export const jsonScript=data=>JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function withMeta(html,meta,schema){
 html=html.replace(/<title>[\s\S]*?<\/title>/,()=>`<title>${esc(meta.title)}</title>`).replace(/<script src="js\/seo.js[^\"]*"><\/script>/,'');
 html=html.replace(/<link rel="canonical"[^>]*>/g,'');
 for(const [attr,val] of [['name="description"',meta.description],['property="og:title"',meta.title],['property="og:description"',meta.description],['property="og:url"',meta.url],['property="og:image"',meta.image]]){
  if(val)html=html.replace(new RegExp('<meta '+attr+'[^>]*>'),()=>`<meta ${attr} content="${esc(val)}">`);
 }
 return html.replace('</head>',`<link rel="canonical" href="${esc(meta.url)}">${schema?'<script type="application/ld+json" data-ssr-schema>'+jsonScript(schema)+'</script>':''}</head>`);
}
// Descriptions are already sanitized by the CMS. Remove unpublished editorial
// references as well; a draft URL must never appear in the public HTML.
export function publishedDescription(html,content){
 const published=new Set((content.journal?.articles||[]).filter(a=>a.published===true).map(a=>a.slug));
 return String(html||'').replace(/<p\b[^>]*>[\s\S]*?<\/p>|<a\b[^>]*>[\s\S]*?<\/a>/gi,block=>{
  let draft=false;
  for(const m of block.matchAll(/href="([^"]+)"/g)){
   try{const u=new URL(m[1].replace(/&amp;/g,'&'),ORIGIN);if(u.origin===new URL(ORIGIN).origin&&u.pathname==='/journal.html'&&u.searchParams.has('story')&&!published.has(u.searchParams.get('story')))draft=true;}catch{}
  }
  return draft?'':block;
 });
}
export function measurementHTML(p){if(p.category==='Footwear')return '';return `<section class="measurements" aria-label="Garment measurements"><h2 class="measurements__title">Measurements</h2>${measurementGroups(p.measurements||{},p.category).map(g=>`${p.category==='Sets'?'<h3 class="measurements__subtitle">'+esc(g.title)+'</h3>':''}<dl class="measurements__list">${g.fields.map(([key,label])=>`<div><dt>${esc(label)}</dt><dd>${esc(formatMeasurement(g.values?.[key]))}</dd></div>`).join('')}</dl>`).join('')}<p class="measurements__note">Measured flat in centimeters; widths are not doubled. Approximate measurements; — indicates unavailable.</p></section>`;}
export function productHTML(p,products,content){
 const numbered=[...products].sort((a,b)=>a.addedOn-b.addedOn||String(a.slug).localeCompare(b.slug));
 const n='No. '+String(numbered.findIndex(x=>x.slug===p.slug)+1).padStart(3,'0');
 const b=brandPage(p.brand);const brandHref=b?b.slug+'.html':'shop.html?brand='+encodeURIComponent(p.brand);
 const facts=[['Brand',p.brand],['Category',p.category],['Label size',p.size],...(productFitsLike(p).length?[['Fits like',productFitsLike(p).join(' / ')]]:[])];
 return `<div class="wrap pdp"><p class="crumbs"><a href="shop.html">Shop</a> / <a href="${esc(brandHref)}">${esc(p.brand)}</a></p><div class="gallery" aria-label="Photos of ${esc(p.name)}"><div class="gallery__track" tabindex="0">${p.images.map((src,i)=>`<figure class="gallery__slide"><button class="gallery__open" type="button" data-i="${i}" aria-label="Enlarge photo ${i+1} of ${p.images.length}" aria-haspopup="dialog"><img style="${imageFrameStyle(p,src)}" src="${esc(src)}"${responsiveAttrs(src, '(min-width:900px) 25vw, 100vw')} alt="${esc(p.name+(i?' detail '+i:' front'))}" width="960" height="1200" ${i?'loading="lazy"':'fetchpriority="high"'} decoding="async"></button></figure>`).join('')}</div></div><div class="pdp__info"><div class="pdp__top"><a class="brand" href="${esc(brandHref)}">${esc(p.brand)}</a><p class="catno">${n}</p></div><h1 class="h-block pdp__name">${esc(p.name)}</h1><div class="pdp__row"><span class="pill">Size ${esc(p.size)}</span><span class="pdp__price">${money(p.price)}</span></div><dl class="facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}<div class="facts__condition"><dt>Condition</dt><dd>${esc(p.condition)}${p.conditionNotes?'<p class="condition-notes">'+esc(p.conditionNotes)+'</p>':''}</dd></div><div><dt>Ref</dt><dd>${n}</dd></div></dl><button class="btn btn--primary btn--block" disabled>${p.sold?'Sold':'Loading bag…'}</button>${p.sold?'':'<p class="pdp__once">'+esc(content.product?.oneOnly||'One piece only.')+'</p>'}<div class="pdp__desc rich">${publishedDescription(p.description,content)}</div><div id="product-measurements">${measurementHTML(p)}</div><p><a class="u" href="size-guide.html">Size guide</a></p><p><a class="u" href="mailto:${esc(content.site?.email||'hello@japansterdam.com')}">Questions about this piece?</a></p></div></div>`;
}
export function brandCards(products,brand,limit=Infinity,eagerCount=0){
 const active=products.filter(p=>p.active!==false);
 const routes=createProductRoutes(active);
 const pieces=active.filter(p=>!p.sold&&(!brand||matchesBrand(p,brand)));
 const selected=pieces.slice(0,limit);
 const html=selected.length?selected.map((p,i)=>`<a class="card" href="${esc(routes.urlFor(p.slug))}"><div class="card__media"><img style="${imageFrameStyle(p,p.images[0])}" src="${esc(p.images[0])}"${responsiveAttrs(p.images[0])} alt="${esc(p.name)}" width="960" height="1200" loading="${i<eagerCount?'eager':'lazy'}"${i===0&&eagerCount?' fetchpriority="high"':''} decoding="async"></div><div class="card__body"><div class="card__top"><p class="card__brand">${esc(p.brand)}</p></div><h3 class="card__name">${esc(p.name)}</h3><p class="card__meta">Size ${esc(p.size)} · ${money(p.price)}</p></div></a>`).join(''):'<p class="brand-empty">No pieces are currently available. Explore the full collection or check back for new arrivals.</p>';
 return {html,count:pieces.length};
}

// Render the initial category controls before JS to reserve their real wrapped height.
export function shopCategoryHTML(products) {
 const active=products.filter(p=>p.active!==false);
 return ['', 'Tops', 'Bottoms', 'Jackets & Outerwear', 'Sets', 'Footwear'].map(cat=>`<button class="chip" type="button" data-cat="${esc(cat)}" aria-pressed="${!cat}">${cat||'All'} <span class="chip__n">${active.filter(p=>!cat||p.category===cat).length}</span></button>`).join('');
}
