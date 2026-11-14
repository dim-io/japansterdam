import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';

test('detail canonical retains identity and removes tracking before CMS rendering',async()=>{
  const code=await readFile(new URL('../js/seo.js',import.meta.url),'utf8');
  for(const [path,expected] of [
    ['product.html?p=needles-shirt&utm_source=test&gclid=123','product.html?p=needles-shirt'],
    ['journal.html?story=fabric%20%26%20fit&utm_source=test','journal.html?story=fabric+%26+fit'],
    ['journal.html?utm_source=test','journal.html'],
  ]){
    let canonical;
    const og={};
    const document={querySelector:s=>s.startsWith('meta')?og:null,createElement:()=>({}),head:{appendChild:el=>canonical=el}};
    vm.runInNewContext(code,{URL,location:{href:'https://japansterdam.com/'+path},document});
    assert.equal(canonical.href,'https://japansterdam.com/'+expected);
    assert.equal(og.content,canonical.href);
  }
});
test('public HTML has canonical identities, current metadata, and one homepage H1',async()=>{
  const root=new URL('../',import.meta.url);
  for(const filename of (await readdir(root)).filter(f=>f.endsWith('.html'))){
    const html=await readFile(new URL(filename,root),'utf8');
    assert.ok(!html.includes('https://dim-io.github.io/japansterdam/'),filename);
    if(['product.html','journal.html'].includes(filename)){
      assert.ok(html.includes('src="js/seo.js?v=seo-1"'),filename);
      assert.ok(!html.includes('rel="canonical"'),filename+' must not hardcode the index canonical');
    }else assert.equal((html.match(/rel="canonical"/g)||[]).length,1,filename);
  }
  const home=await readFile(new URL('index.html',root),'utf8');
  assert.equal((home.match(/<h1[ >]/g)||[]).length,1);
  const org=JSON.parse(home.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(org.email,'hello@japansterdam.com');
  assert.ok(org.sameAs.includes('https://www.instagram.com/japansterdam_store/'));
});
