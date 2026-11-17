import { optimizePageAssets } from './page-assets.mjs';
import { execFileSync } from 'node:child_process';
import { responsiveAttrs } from '../../js/responsive-images.js';
// Copy only public website files. Never publish API code, credentials,
// hidden catalogue snapshots, tooling or private Journal drafts as assets.
import { readdir,readFile,writeFile,cp,mkdir,rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=new URL('../../',import.meta.url),out=new URL('.site-dist/',root);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const name of await readdir(root))if(name.endsWith('.html')||['robots.txt','sitemap.xml'].includes(name))await cp(new URL(name,root),new URL(name,out));
for(const name of ['css','js','assets','admin'])await cp(new URL(name+'/',root),new URL(name+'/',out),{recursive:true,filter:src=>!fileURLToPath(new URL('file://'+src)).split('/').pop().startsWith('.')});
await mkdir(new URL('data/',out));
const fallback=JSON.parse(await readFile(new URL('data/content.json',root),'utf8'));
if(fallback.journal)fallback.journal.articles=[];
await writeFile(new URL('data/content.json',out),JSON.stringify(fallback));
await writeFile(new URL('data/products.json',out),'[]');
console.log('Prepared public assets in .site-dist');

execFileSync('python3', [fileURLToPath(new URL('../../scripts/prepare-images.py', import.meta.url))], {stdio:'inherit'});
for (const name of await readdir(out)) if(name.endsWith('.html')) {
 const path=new URL(name,out);let html=await readFile(path,'utf8');
 html=optimizePageAssets(html);
 html=html.replace(/<img\b[^>]*>/g,tag=>{const src=tag.match(/\bsrc="([^"]+)"/)?.[1];return src&&!tag.includes('srcset=')?tag.replace('<img','<img'+responsiveAttrs(src,'(min-width:900px) 50vw, 100vw')):tag;});
 await writeFile(path,html);
}
