// Private account transfer runner. Never log tokens, SQL, rows, images or signed URLs.
import {pathToFileURL} from 'node:url';
export const SOURCE={account:'0e3359947b78095a7afd9ce36f5cac6f',database:'4e52cd67-a370-400b-b79b-ca1527cc03de',kv:'8a168c9f3c4f4594a08248a29656d8dc'};
export const TARGET={account:'81a93f1ef55a892620ab77cf0f8163f6'};
export function connection(account,token){
 if(!token)throw Error('credential_missing');
 return async(path,options={})=>{
  if(!path.startsWith('/')||path.includes('..'))throw Error('invalid_path');
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers},redirect:'error',signal:AbortSignal.timeout(60000)});
  const d=await r.json();if(!r.ok||d.success!==true)throw Error('cloudflare_http_'+r.status+'_'+(d.errors||[]).map(e=>e.code).join('_'));
  return d;
 };
}
export async function plan(source,target){
 const checks=[['source_database',source,`/d1/database/${SOURCE.database}`],['source_images',source,`/storage/kv/namespaces/${SOURCE.kv}/keys?limit=1000`],['source_worker',source,'/workers/scripts/japansterdam-api/settings'],['target_databases',target,'/d1/database'],['target_namespaces',target,'/storage/kv/namespaces'],['target_workers',target,'/workers/scripts'],['target_domain',target,'/workers/subdomain']];
 const result={};
 for(const [name,api,path] of checks){try{const d=await api(path);result[name]={ok:true};if(name==='source_images')result[name].keys=d.result.length;if(name==='target_domain')result[name].subdomain=d.result.subdomain;if(name==='target_databases')result[name].databases=d.result.map(x=>({name:x.name,id:x.uuid}));if(name==='target_namespaces')result[name].namespaces=d.result.map(x=>({name:x.title,id:x.id}));if(name==='target_workers')result[name].workers=d.result.map(x=>x.id);}catch(e){result[name]={ok:false,error:e.message};}}
 return result;
}
async function main(){
 const source=connection(SOURCE.account,process.env.SOURCE_CLOUDFLARE_API_TOKEN),target=connection(TARGET.account,process.env.TARGET_CLOUDFLARE_API_TOKEN);
 if((process.env.TRANSFER_PHASE||'plan')!=='plan')throw Error('phase_not_implemented');
 const result=await plan(source,target);console.log(JSON.stringify(result,null,2));
 if(Object.values(result).some(x=>!x.ok))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'transfer_failed');process.exitCode=1;});
