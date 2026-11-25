import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
// Fingerprinted ESM bundles remove long module waterfalls. Query versions in
// source imports are cache keys, not separate modules, so share one copy.
export async function bundlePageAssets(root,htmlFiles){
 const pages=await Promise.all(htmlFiles.map(async file=>({file,html:await readFile(file,'utf8')})));
 const entries=new Set();
 for(const {html} of pages){
  for(const m of html.matchAll(/<script\b[^>]*\bsrc="(js\/[\w.-]+\.m?js)(?:\?[^\"]*)?"[^>]*>/g))entries.add(m[1]);
  for(const m of html.matchAll(/<link\b[^>]*\bhref="(css\/[\w.-]+\.css)(?:\?[^\"]*)?"[^>]*>/g))entries.add(m[1]);
 }
 if(!entries.size)return;
 const result=await build({absWorkingDir:root,entryPoints:[...entries],outdir:resolve(root,'assets/bundles'),entryNames:'[name]-[hash]',chunkNames:'shared-[hash]',bundle:true,splitting:true,format:'esm',platform:'browser',target:['es2022'],minify:true,metafile:true,logLevel:'warning',plugins:[{name:'public-asset-paths',setup(b){
  b.onResolve({filter:/\.[cm]?js\?v=/},args=>({path:resolve(args.resolveDir,args.path.split('?')[0])}));
  b.onResolve({filter:/.*/},args=>args.kind==='url-token'&&!/^(https?:|data:|\/|#)/.test(args.path)?{path:'/'+relative(root,resolve(args.resolveDir,args.path)).replaceAll('\\','/'),external:true}:null);
 }}]});
 const outputs=result.metafile.outputs,entryMap=new Map();
 for(const [path,meta] of Object.entries(outputs))if(meta.entryPoint)entryMap.set(meta.entryPoint,'/'+path.replaceAll('\\','/'));
 for(const {file,html} of pages){
  const preload=new Set();
  const collect=path=>{for(const item of outputs[path]?.imports||[]){if(item.external||preload.has(item.path))continue;preload.add(item.path);collect(item.path);}};
  let next=html.replace(/(<script\b[^>]*\bsrc=")(js\/[\w.-]+\.m?js)(?:\?[^\"]*)?("[^>]*>)/g,(tag,start,src,end)=>{const dest=entryMap.get(src);if(!dest)return tag;collect(dest.slice(1));return start+dest+end;});
  next=next.replace(/(<link\b[^>]*\bhref=")(css\/[\w.-]+\.css)(?:\?[^\"]*)?("[^>]*>)/g,(tag,start,src,end)=>entryMap.has(src)?start+entryMap.get(src)+end:tag);
  if(preload.size)next=next.replace('</head>',[...preload].map(path=>'<link rel="modulepreload" href="/'+path+'">').join('\n')+'\n</head>');
  await writeFile(file,next);
 }
 return result.metafile;
}
