// Run after changing the shared navigation/footer. --check detects stale HTML.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {renderChrome} from '../js/chrome.js';
const root=new URL('../',import.meta.url);
let stale=false;
for(const file of (await readdir(root)).filter(f=>f.endsWith('.html'))){
 const path=new URL(file,root),before=await readFile(path,'utf8');
 if(!before.includes('id="site-header"'))continue;
 const {headerHTML,footerHTML}=renderChrome(file);
 const after=before.replace(/<header id="site-header"[^>]*>[\s\S]*?<\/header>/,`<header id="site-header" class="site-header">${headerHTML()}</header>`)
  .replace(/<footer id="site-footer"[^>]*>[\s\S]*?<\/footer>/,`<footer id="site-footer" class="site-footer">${footerHTML()}</footer>`);
 if(before!==after){stale=true;if(process.argv.includes('--check'))console.error('Stale chrome: '+file);else await writeFile(path,after);}
}
if(stale&&process.argv.includes('--check'))process.exitCode=1;
