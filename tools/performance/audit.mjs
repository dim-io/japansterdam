// Repeatable cold-load audits of the public storefront only; never admin or checkout.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
const mode=process.argv[2];
if(!['mobile','desktop'].includes(mode))throw Error('Choose mobile or desktop');
const phase=JSON.parse(readFileSync('tools/performance/request.json','utf8')).phase;
const out=join(process.env.RUNNER_TEMP||'/tmp','japansterdam-performance',phase,mode);
mkdirSync(out,{recursive:true});
const pages=[['home','/'],['shop','/shop.html'],['product','/product.html?p=nulabel-reflector-tweed-officer-set-overshirt-and-pants'],['journal','/journal.html'],['story','/journal.html?story=nulabel-built-for-the-city-found-in-two-parts']];
const results=[];
for(const [page,path] of pages){
 const file=join(out,page+'.json');
 const args=['https://japansterdam.com'+path,'--only-categories=performance','--output=json','--output-path='+file,'--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--quiet'];
 if(mode==='desktop')args.push('--preset=desktop');
 execFileSync(process.env.LIGHTHOUSE_BIN,args,{stdio:'inherit',timeout:180000});
 const r=JSON.parse(readFileSync(file,'utf8'));
 if(r.runtimeError)throw Error(JSON.stringify(r.runtimeError));
 const value=id=>r.audits[id]?.numericValue;
 const result={phase,page,mode,url:r.finalDisplayedUrl||r.finalUrl,fetchTime:r.fetchTime,lighthouseVersion:r.lighthouseVersion,userAgent:r.environment?.networkUserAgent,settings:r.configSettings,score:Math.round(r.categories.performance.score*100),fcp:value('first-contentful-paint'),lcp:value('largest-contentful-paint'),tbt:value('total-blocking-time'),cls:value('cumulative-layout-shift'),speedIndex:value('speed-index'),bytes:value('total-byte-weight'),requests:r.audits['network-requests']?.details?.items?.length,diagnostics:Object.fromEntries(Object.entries(r.audits).filter(([k,a])=>a.score!==null&&a.score<.9&&a.details&&!['screenshot-thumbnails','full-page-screenshot'].includes(k)).map(([k,a])=>[k,{title:a.title,displayValue:a.displayValue,details:a.details}])),largestResources:(r.audits['network-requests']?.details?.items||[]).sort((a,b)=>b.transferSize-a.transferSize).slice(0,12).map(x=>({url:x.url,bytes:x.transferSize,type:x.resourceType})),lcpElement:r.audits['largest-contentful-paint-element']?.details};
 results.push(result);console.log('JP_PERF_RESULT '+JSON.stringify(result));
}
writeFileSync(join(out,'summary.json'),JSON.stringify(results,null,2));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## ${phase} / ${mode}\n\n|Page|Score|LCP|FCP|TBT|CLS|Transferred|\n|---|---:|---:|---:|---:|---:|---:|\n`+results.map(r=>`|${r.page}|${r.score}|${(r.lcp/1000).toFixed(2)} s|${(r.fcp/1000).toFixed(2)} s|${Math.round(r.tbt)} ms|${r.cls.toFixed(3)}|${Math.round(r.bytes/1024)} KB|`).join('\n')+'\n');
