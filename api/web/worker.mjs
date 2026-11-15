import { createProductRoutes } from '../../js/product-urls.js';
import { BRAND_PAGES } from '../../js/brand-pages.js';
import { sitemapXML } from '../src/sitemap.mjs';
import { ORIGIN,productMeta,productSchema,withMeta,productHTML,brandCards } from './render.mjs';
const API='https://japansterdam-api.japansterdam-api.workers.dev';
async function catalog(env){
 const source=env.SOURCE_FETCH||fetch;
 const results=await Promise.all(['/public/products','/public/content'].map(async path=>{
  const r=await source(API+path,{signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('Catalogue unavailable');return r.json();
 }));
 if(!Array.isArray(results[0]))throw Error('Invalid catalogue');
 return [results[0].filter(p=>p.active!==false),results[1]];
}
function errorPage(status){return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${status===404?'Piece not found':'Collection temporarily unavailable'} — Japansterdam</title><body><h1>${status===404?'Piece not found':'Collection temporarily unavailable'}</h1><p>${status===404?'This piece is not currently listed.':'Please try again shortly.'}</p><a href="/shop.html">Back to the shop</a></body></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});}
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const brand=BRAND_PAGES.find(b=>u.pathname==='/'+b.slug+'.html');
 let response;
 if(u.pathname==='/sitemap.xml'){
  try{
   const [products,content]=await catalog(env);
   response=new Response(sitemapXML(products,content),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
  }catch{return errorPage(503);}
 }else if(u.pathname==='/product.html'||brand){
  try{
   const [products,content]=await catalog(env);
   const asset=await env.ASSETS.fetch(new Request(u.origin+u.pathname));
   if(!asset.ok)throw Error('Template unavailable');
   let html=await asset.text();
   if(brand){
    const cards=brandCards(products,brand.brand);
    html=html.replace(/<div class="grid" id="brand-pieces">[\s\S]*?<\/div>/,()=>'<div class="grid" id="brand-pieces">'+cards.html+'</div>');
    html=html.replace(/<p id="brand-count"[^>]*>[\s\S]*?<\/p>/,()=>'<p id="brand-count" aria-live="polite">'+cards.count+' '+(cards.count===1?'piece':'pieces')+'</p>');
   }else{
    const routes=createProductRoutes(products),p=routes.find(u.searchParams.get('p')||'');
    if(!p)return errorPage(404);
    const canonical=new URL(routes.urlFor(p.slug),ORIGIN).href;
    const friendly=new URL(canonical).searchParams.get('p');
    if(u.searchParams.get('p')!==friendly){const redirect=new URL(u);redirect.searchParams.set('p',friendly);return Response.redirect(redirect.href,301);}
    html=withMeta(html,productMeta(p,canonical),productSchema(p,canonical));
    html=html.replace('<div id="pdp-root"></div>',()=>'<div id="pdp-root" data-server-rendered>'+productHTML(p,products,content)+'</div>');
    html=html.replace(/<noscript>[\s\S]*?<\/noscript>/,'<noscript><p style="padding:24px">Enable JavaScript to use the bag and switch measurement units, or contact hello@japansterdam.com.</p></noscript>');
   }
   response=new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }catch{return errorPage(503);}
 }else response=await env.ASSETS.fetch(request);
 const out=new Response(request.method==='HEAD'?null:response.body,response);
 if(!['japansterdam.com','www.japansterdam.com'].includes(u.hostname))out.headers.set('X-Robots-Tag','noindex, nofollow');
 return out;
}};
