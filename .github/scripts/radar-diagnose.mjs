// Read existing runs only; publish aggregate counts, never individual records,
// IDs, timestamps, prices, costs, seller data, URLs, input or credentials.
const BASE = 'https://api.apify.com/v2';
export async function diagnose(token, fetcher = fetch) {
  if (!token) throw new Error('Diagnoseconfiguratie ontbreekt');
  async function get(path) {
    let response;
    try { response = await fetcher(BASE + path, { headers: {Authorization:'Bearer ' + token}, redirect:'manual', signal:AbortSignal.timeout(30000) }); }
    catch { throw new Error('Diagnosebron niet bereikbaar'); }
    if (!response.ok) throw new Error('Diagnosebron gaf geen geldig antwoord');
    return response.json();
  }
  const start=Date.parse('2026-11-04T22:29:16.260330+00:00'),end=Date.parse('2026-11-05T22:29:16.260330+00:00');
  const listing=await get('/acts/omkar-cloud~vinted-scraper/runs?desc=true&limit=50');
  const runs=listing.data.items.filter((r)=>Date.parse(r.startedAt)>=start && Date.parse(r.startedAt)<end);
  const seen=new Set();
  const result={readOnly:true,runsChecked:0,failedRuns:0,searchConfigCorrect:true,maxThreeResults:true,resultsChecked:0,uniqueItems:0,repeatItems:0};
  for(const run of runs.reverse()) {
    if(run.status!=='SUCCEEDED') { result.failedRuns++;continue; }
    const input=await get('/key-value-stores/'+encodeURIComponent(run.defaultKeyValueStoreId)+'/records/INPUT');
    // Examine only the known pilot searches; exclude unrelated account work.
    if(!['360271','576107'].includes(input.brandIds) || input.maxResults!==3)continue;
    result.runsChecked++;
    let correct=false;
    try {const u=new URL(input.searchQueries?.[0]);correct=u.hostname==='www.vinted.nl' && u.searchParams.get('brand_ids[]')===input.brandIds && u.searchParams.get('order')==='newest_first' && u.searchParams.get('price_to')==='40' && input.sortBy==='newest_first';}catch{}
    result.searchConfigCorrect &&= correct;
    const rows=await get('/datasets/'+encodeURIComponent(run.defaultDatasetId)+'/items?clean=true&format=json&limit=4');
    result.maxThreeResults &&= rows.length<=3;
    for(const r of rows.slice(0,3)) {
      const id=String(r.id || /\/items\/(\d+)/.exec(r.link || r.url)?.[1] || '');
      if(!id)continue;
      result.resultsChecked++;
      if(seen.has(id)) result.repeatItems++;else {seen.add(id);result.uniqueItems++;}
    }
  }
  return result;
}
if(process.argv[1]?.endsWith('/radar-diagnose.mjs')) {
  try {console.log(JSON.stringify(await diagnose(process.env.APIFY_TOKEN)));}
  catch {console.error('Diagnose niet voltooid; er zijn geen scans gestart.');process.exitCode=1;}
}
