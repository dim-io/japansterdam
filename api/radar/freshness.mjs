// Read one public catalogue snapshot; no login, challenge bypass or extra scraper run.
// An inaccessible/ambiguous page is unknown, never proof of fresh results.
export async function compareCatalog(brandId,items,fetcher=fetch) {
  const url=new URL('https://www.vinted.nl/catalog');
  url.search=new URLSearchParams({'brand_ids[]':brandId,price_to:'40',currency:'EUR',order:'newest_first'});
  try {
    const r=await fetcher(url.href,{redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!r.ok || !r.headers.get('content-type')?.includes('text/html'))return {state:'unverified',reason:'catalog_unavailable'};
    const reader=r.body.getReader();let size=0,html='';const decoder=new TextDecoder();
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024)return {state:'unverified',reason:'catalog_too_large'};html+=decoder.decode(value,{stream:true});}}
    finally{await reader.cancel().catch(()=>{});}
    if(/captcha|cf-chl-|challenge-platform/i.test(html))return {state:'unverified',reason:'catalog_challenge'};
    const ids=[...new Set([...html.matchAll(/href=["'](?:https:\/\/www\.vinted\.nl)?\/items\/(\d+)[^"']*["']/g)].map(m=>m[1]))].slice(0,3);
    const actual=items.map(i=>/\/items\/(\d+)/.exec(i.url)?.[1]);
    if(ids.length<3)return {state:'unverified',reason:'catalog_no_readable_items'};
    const same=ids.every((id,i)=>id===actual[i]);
    return {state:same?'consistent_snapshot':'different_snapshot',compared:ids.length,matched:ids.filter(id=>actual.includes(id)).length};
  }catch{return {state:'unverified',reason:'catalog_unavailable'};}
}
