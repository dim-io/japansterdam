// Existing Apify records only: no actor starts, no AI and no Telegram calls.
const token=process.env.APIFY_TOKEN;
if(!token)throw Error('Missing source credential');
const get=async path=>{const r=await fetch('https://api.apify.com/v2'+path,{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('source_audit_http_'+r.status);return r.json();};
const valid=id=>/^[a-zA-Z0-9]+$/.test(id||'');
const list=await get('/acts/omkar-cloud~vinted-scraper/runs?desc=true&limit=60');
const seen=new Map();let checked=0;
for(const run of list.data?.items||[]){
 if(checked>=12)break;
 if(run.status!=='SUCCEEDED'||!valid(run.defaultKeyValueStoreId)||!valid(run.defaultDatasetId))continue;
 const input=await get('/key-value-stores/'+run.defaultKeyValueStoreId+'/records/INPUT');
 const key=input.brandIds||input.searchQueries?.[0]||'';
 if(!key||seen.get(key)>=2)continue;
 seen.set(key,(seen.get(key)||0)+1);checked++;
 const rows=await get('/datasets/'+run.defaultDatasetId+'/items?clean=true&format=json&limit=10');
 console.log(JSON.stringify({finishedAt:run.finishedAt,input:{brandIds:input.brandIds,sortBy:input.sortBy,searchQueries:input.searchQueries,maxResults:input.maxResults,includeDetails:input.includeDetails},rows:rows.map(r=>({id:/\/items\/(\d+)/.exec(r.link||r.url||'')?.[1],title:String(r.title||'').slice(0,100),brand:r.brand,age:r.uploaded_ago,publishedAt:r.published_at,createdAt:r.created_at,category:r.category_path,keys:Object.keys(r)}))}));
}
