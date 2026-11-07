import {pathToFileURL} from 'node:url';
import {TARGET} from './account-migration.mjs';
// Register only the default address already displayed in Sam's account.
// Existing subdomains are preserved; no website DNS or zone is changed.
export async function ensureDomain(token,fetcher=fetch){
  if(!token)throw Error('token_missing');
  const url=`https://api.cloudflare.com/client/v4/accounts/${TARGET.account}/workers/subdomain`;
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const existing=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
  const data=await existing.json();
  if(existing.ok&&data.success&&data.result?.subdomain)return data.result.subdomain;
  if(!data.errors?.some(e=>e.code===10007))throw Error('workers_subdomain_read_failed_http_'+existing.status);
  const created=await fetcher(url,{method:'PUT',headers,body:JSON.stringify({subdomain:'sam-jesse'}),redirect:'error',signal:AbortSignal.timeout(30000)});
  const result=await created.json();
  if(!created.ok||!result.success||result.result?.subdomain!=='sam-jesse')throw Error('workers_subdomain_registration_failed_http_'+created.status);
  return result.result.subdomain;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)ensureDomain(process.env.CLOUDFLARE_API_TOKEN).then(domain=>console.log('Workers-adres gecontroleerd: '+domain+'.workers.dev')).catch(error=>{console.error(/^[a-z_0-9]+$/.test(error.message)?error.message:'workers_subdomain_failed');process.exitCode=1;});
