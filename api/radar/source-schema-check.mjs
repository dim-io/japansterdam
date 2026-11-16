// Read one already-completed acceptance dataset. No new scraper run or messages.
import {monitorRow} from './monitor-source.mjs';
import policy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
if(policy.sourceProvider==='topapi-monitor'){
 const get=async path=>{const r=await fetch('https://api.apify.com/v2'+path,{headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN},redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Source fixture not available');return r.json();};
 const run=(await get('/actor-runs/jBBagIgBSkMmON5ox')).data;
 if(!/^[a-zA-Z0-9]+$/.test(run?.defaultDatasetId||''))throw Error('Invalid acceptance dataset');
 const rows=await get('/datasets/'+run.defaultDatasetId+'/items?clean=true&format=json&limit=1');
 const item=monitorRow(rows[0]||{},run.finishedAt);
 const report={schemaVerified:!!item,price:typeof item?.price==='number',availability:item?.available===true,condition:!!item?.condition,publication:!!item?.publishedAt,photos:(item?.photoUrls?.length||0)>0};
 console.log(JSON.stringify(report));
 if(!Object.values(report).every(Boolean))throw Error('Replacement source schema not verified');
}
