import { brandPage } from './brand-pages.js';
const origin = 'https://japansterdam.com/';
export function productSEOTitle(p) {
 const brand = String(p.name).toLowerCase().includes(String(p.brand).toLowerCase()) ? '' : ' — ' + p.brand;
 const size = p.category === 'Footwear' && p.size && !/\b(?:size|EU)\s*\d/i.test(p.name) ? ' — Size ' + p.size : '';
 return p.name + brand + size + ' — Japansterdam';
}
export function articleSEOTitle(a) { return a.seoTitle?.trim() || a.title + ' — Japansterdam Journal'; }
export function articleSEODescription(a) { return a.seoDescription?.trim() || a.subtitle || ''; }
export function productBreadcrumb(p, url) {
 const brand = brandPage(p.brand);
 const items = [{name:'Shop',item:origin+'shop.html'}];
 if (brand) items.push({name:brand.brand,item:origin+brand.slug+'.html'});
 items.push({name:p.name,item:url});
 return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items.map((item,i)=>({'@type':'ListItem',position:i+1,...item}))};
}
// Only public shipping facts belong in HTML, never checkout/provider settings.
export function publicCommerce(settings = {}) {
 const shipping = (Array.isArray(settings.shipping) ? settings.shipping : []).filter(r=>/^[A-Z]{2}$/.test(r.country) && Number.isInteger(r.cents) && r.cents>=0).map(r=>({country:r.country,cents:r.cents}));
 // Emit the current published policy only while its relevant terms still match.
 const returns = /within 14 days after the day they receive the item/.test(settings.returnsText||'') && /Return shipping costs are the customer's responsibility/.test(settings.returnsText||'');
 return {shipping, returns};
}
export function offerPolicy(commerce = {}) {
 const shippingDetails = (commerce.shipping||[]).map(r=>({'@type':'OfferShippingDetails',shippingDestination:{'@type':'DefinedRegion',addressCountry:r.country},shippingRate:{'@type':'MonetaryAmount',value:(r.cents/100).toFixed(2),currency:'EUR'}}));
 return {...(shippingDetails.length ? {shippingDetails} : {}),...(commerce.returns ? {hasMerchantReturnPolicy:{'@type':'MerchantReturnPolicy',merchantReturnLink:origin+'shipping-returns.html',applicableCountry:(commerce.shipping||[]).map(r=>r.country),returnPolicyCategory:'https://schema.org/MerchantReturnFiniteReturnWindow',merchantReturnDays:14,returnMethod:'https://schema.org/ReturnByMail',returnFees:'https://schema.org/ReturnFeesCustomerResponsibility'}} : {})};
}
