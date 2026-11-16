import { renderPage } from '../../js/page-views.js';
import { liveStories, storyCard, journalHTML, articleBody } from './editorial.mjs';
import { createProductRoutes } from '../../js/product-urls.js';
import { BRAND_PAGES } from '../../js/brand-pages.js';
import { sitemapXML } from '../src/sitemap.mjs';
import { ORIGIN,productMeta,productSchema,withMeta,productHTML,brandCards,esc,jsonScript } from './render.mjs';
const API='https://japansterdam-api.sam-jesse.workers.dev';
async function catalog(env){
 const source=env.SOURCE_FETCH||(env.API_BACKEND?env.API_BACKEND.fetch.bind(env.API_BACKEND):fetch);
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
 if(['japansterdam.com','www.japansterdam.com'].includes(u.hostname)&&(u.protocol!=='https:'||u.hostname==='www.japansterdam.com'||u.pathname==='/index.html')){
  u.protocol='https:';u.hostname='japansterdam.com';if(u.pathname==='/index.html')u.pathname='/';
  return Response.redirect(u.href,301);
 }
 // Browsers and crawlers also request the conventional icon URL.
 if(u.pathname==='/favicon.ico')return new Response(null,{status:302,headers:{Location:new URL('/assets/icons/favicon.svg',u.origin).href,'Cache-Control':'public, max-age=3600'}});
 // Missing build variants (for example a new CMS upload) use the original.
 if(u.pathname.startsWith('/assets/optimized/')){
  const asset=await env.ASSETS.fetch(request);if(asset.status!==404)return asset;
  const m=u.pathname.match(/^\/assets\/optimized\/(uploads|local)\/([\w./-]+\.(?:jpe?g|png|webp))-(480|960)\.webp$/i);
  if(!m||m[2].includes('..'))return errorPage(404);
  const original=m[1]==='uploads'?API+'/img/products/'+m[2]:u.origin+'/assets/img/'+m[2];
  return new Response(null,{status:302,headers:{Location:original,'Cache-Control':'public, max-age=60'}});
 }
 const pages={'/about.html':'about','/contact.html':'contact','/faq.html':'faq','/shipping-returns.html':'shipping','/privacy-policy.html':'privacy','/size-guide.html':'size'};
 const home=u.pathname==='/'||u.pathname==='/index.html',shop=u.pathname==='/shop.html',journal=u.pathname==='/journal.html';
 const brand=BRAND_PAGES.find(b=>u.pathname==='/'+b.slug+'.html');
 let response;
 if(u.pathname==='/sitemap.xml'){
  try{
   const [products,content]=await catalog(env);
   response=new Response(sitemapXML(products,content),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
  }catch{return errorPage(503);}
 }else if(u.pathname==='/product.html'||brand||home||shop||journal||pages[u.pathname]){
  try{
   const [products,content]=await catalog(env);
   const asset=await env.ASSETS.fetch(new Request(u.origin+u.pathname));
   if(!asset.ok)throw Error('Template unavailable');
   let html=await asset.text();
   if(pages[u.pathname]){
    html=html.replace('<div id="page-root"></div>',()=>'<div id="page-root" data-server-rendered>'+renderPage(pages[u.pathname],content)+'</div>');
   }else if(journal){
    const page=journalHTML(content,products,u.searchParams.get('story'));
    if(!page)return errorPage(404);
    html=withMeta(html,page.meta,page.schema);
    html=html.replace(/<div id="journal-root">[\s\S]*?<\/div>/,()=>'<div id="journal-root" data-server-rendered>'+page.html+'</div>');
   }else if(home||shop){
    const id=home?'collection-grid':'shop-grid',cards=brandCards(products,null,home?4:Infinity);
    html=html.replace('<div class="grid" id="'+id+'"></div>',()=>'<div class="grid" id="'+id+'">'+cards.html+'</div>');
    if(shop)html=html.replace(/(<p[^>]*id="shop-count"[^>]*>)[\s\S]*?<\/p>/,(_,open)=>open+cards.count+' pieces</p>');
    if(home){
     html=html.replace(/(<blockquote id="quote-text">)[\s\S]*?<\/blockquote>/,(_,open)=>open+'“'+esc(content.home?.quote||'')+'”</blockquote>');
     html=html.replace(/(<cite id="quote-by">)[\s\S]*?<\/cite>/,(_,open)=>open+esc(content.home?.quoteBy||'')+'</cite>');
     html=html.replace(/(<a[^>]*id="collection-cta"[^>]*>)[\s\S]*?<\/a>/,(_,open)=>open+esc(content.home?.collectionCta||'Shop all')+'</a>');
     const stories=liveStories(content).slice(0,2);
     if(stories.length){html=html.replace('aria-labelledby="home-journal-title" hidden','aria-labelledby="home-journal-title"');html=html.replace('<div class="journal-grid" id="home-journal-grid"></div>',()=>'<div class="journal-grid" id="home-journal-grid">'+stories.map(storyCard).join('')+'</div>');}
    }
   }else if(brand){
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
   }
   const publicContent={...content,home:{...content.home,testimonials:[]},journal:{...content.journal,articles:liveStories(content).map(a=>({...a,bodyHtml:articleBody(a.bodyHtml)}))}};
   html=html.replace('</body>',()=>'<script type="application/json" id="jp-page-data">'+jsonScript({content:publicContent,products})+'</script></body>');
   html=html.replace(/<link rel="preload" href="https:\/\/japansterdam-api\.sam-jesse\.workers\.dev\/public\/(?:content|products)"[^>]*>/g,'');
   html=html.replace(/<noscript>[\s\S]*?<\/noscript>/,'<noscript><p style="padding:24px">Enable JavaScript for interactive filters, the bag and measurement units.</p></noscript>');
   response=new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }catch{return errorPage(503);}
 }else response=await env.ASSETS.fetch(request);
 const out=new Response(request.method==='HEAD'?null:response.body,response);
 if(u.pathname==='/checkout.html'){
  out.headers.set('Cache-Control','no-store');
  out.headers.set('Referrer-Policy','no-referrer');
  out.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://japansterdam-api.sam-jesse.workers.dev; connect-src 'self' https://japansterdam-api.sam-jesse.workers.dev https://cloudflareinsights.com; frame-src https://*.stripe.com https://*.link.com; object-src 'none'; base-uri 'self'; form-action 'self' mailto:; frame-ancestors 'none'");
 }
 if(!['japansterdam.com','www.japansterdam.com'].includes(u.hostname))out.headers.set('X-Robots-Tag','noindex, nofollow');
 return out;
}};
