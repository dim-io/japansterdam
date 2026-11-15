// Private account transfer runner. Never log tokens, SQL, rows, images or signed URLs.
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export const SOURCE={account:'0e3359947b78095a7afd9ce36f5cac6f',database:'4e52cd67-a370-400b-b79b-ca1527cc03de',kv:'8a168c9f3c4f4594a08248a29656d8dc'};
export const TARGET={account:'81a93f1ef55a892620ab77cf0f8163f6'};
export const OLD_ORIGIN='https://japansterdam-api.japansterdam-api.workers.dev';
export const NEW_ORIGIN='https://japansterdam-api.sam-jesse.workers.dev';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export const rewrite=value=>typeof value==='string'?value.replaceAll(OLD_ORIGIN,NEW_ORIGIN):value;
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function connection(account,token){
 if(!token)throw Error('credential_missing');
 return async(path,options={},raw=false)=>{
  if(!path.startsWith('/')||path.includes('..'))throw Error('invalid_path');
  for(let attempt=0;attempt<5;attempt++){
   const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers},redirect:'error',signal:AbortSignal.timeout(120000)});
   if(r.status===429||r.status>=500){await pause(1000*2**attempt);continue;}
   if(raw){if(!r.ok)throw Error('cloudflare_binary_http_'+r.status);return Buffer.from(await r.arrayBuffer());}
   const d=await r.json();if(!r.ok||d.success!==true)throw Error('cloudflare_http_'+r.status+'_'+(d.errors||[]).map(e=>e.code).join('_'));
   return d;
  }throw Error('cloudflare_retries_exhausted');
 };
}
const post=(api,path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
export async function plan(source,target){
 const checks=[['source_database',source,`/d1/database/${SOURCE.database}`],['source_images',source,`/storage/kv/namespaces/${SOURCE.kv}/keys?limit=1000`],['source_worker',source,'/workers/scripts/japansterdam-api/settings'],['target_databases',target,'/d1/database'],['target_namespaces',target,'/storage/kv/namespaces'],['target_workers',target,'/workers/scripts'],['target_domain',target,'/workers/subdomain']];
 const result={};
 for(const [name,api,path] of checks){try{const d=await api(path);result[name]={ok:true};if(name==='source_images')result[name].keys=d.result.length;if(name==='target_domain')result[name].subdomain=d.result.subdomain;if(name==='target_databases')result[name].databases=d.result.map(x=>({name:x.name,id:x.uuid}));if(name==='target_namespaces')result[name].namespaces=d.result.map(x=>({name:x.title,id:x.id}));if(name==='target_workers')result[name].workers=d.result.map(x=>x.id);}catch(e){result[name]={ok:false,error:e.message};}}
 return result;
}
export function signedURL(value){const u=new URL(value);if(u.protocol!=='https:'||!u.hostname.endsWith('.r2.cloudflarestorage.com')||u.username||u.password)throw Error('untrusted_signed_url');return u.href;}
async function exportSQL(api,db){
 let current_bookmark;
 for(let i=0;i<120;i++){
  const d=(await post(api,`/d1/database/${db}/export`,{output_format:'polling',dump_options:{compatibility:'d1'},current_bookmark})).result;
  if(d.status==='error'||d.success===false)throw Error('database_export_failed');
  if(d.status==='complete'){const r=await fetch(signedURL(d.result.signed_url),{redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('export_download_failed');return await r.text();}
  current_bookmark=d.at_bookmark;await pause(1000);
 }throw Error('export_timeout');
}
async function importSQL(api,db,sql){
 const etag=createHash('md5').update(sql).digest('hex'),path=`/d1/database/${db}/import`;
 let d=(await post(api,path,{action:'init',etag})).result;
 if(d.upload_url){
  const r=await fetch(signedURL(d.upload_url),{method:'PUT',body:sql,redirect:'error',signal:AbortSignal.timeout(120000)});
  if(!r.ok||r.headers.get('etag')?.replaceAll('"','')!==etag)throw Error('import_upload_failed');
  d=(await post(api,path,{action:'ingest',etag,filename:d.filename})).result;
 }
 for(let i=0;i<120;i++){
  if(d.status==='complete')return;
  if(d.status==='error'||d.success===false)throw Error('database_import_failed');
  await pause(1000);d=(await post(api,path,{action:'poll',current_bookmark:d.at_bookmark})).result;
 }throw Error('import_timeout');
}
const ident=s=>{if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(s))throw Error('invalid_identifier');return '"'+s+'"';};
async function query(api,db,sql,params=[]){const d=await post(api,`/d1/database/${db}/query`,{sql,params});if(d.result.some(x=>x.success===false))throw Error('query_failed');return d.result[0].results;}
export async function snapshot(api,db,normalize=false){
 const schema=await query(api,db,"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'backend_account_transfer' ORDER BY type,name");
 const tables={};
 for(const t of schema.filter(x=>x.type==='table')){
  const hashes=[];
  for(let offset=0;;offset+=250){const rows=await query(api,db,`SELECT * FROM ${ident(t.name)} LIMIT 250 OFFSET ${offset}`);for(const r of rows){const stable=Object.keys(r).sort().map(k=>[k,normalize?rewrite(r[k]):r[k]]);hashes.push(digest(JSON.stringify(stable)));}if(rows.length<250)break;}
  tables[t.name]={rows:hashes.length,hash:digest(JSON.stringify(hashes.sort()))};
 }
 return {schema:digest(JSON.stringify(schema)),tables};
}
async function keys(api,ns){let cursor;const all=[];do{const d=await api(`/storage/kv/namespaces/${ns}/keys?limit=1000`+(cursor?'&cursor='+encodeURIComponent(cursor):''));all.push(...d.result);cursor=d.result_info?.cursor;}while(cursor);return all.sort((a,b)=>a.name.localeCompare(b.name));}
export async function copyImages(source,target,ns){
 const before=await keys(source,SOURCE.kv),existing=await keys(target,ns),seen=new Set(before.map(k=>k.name));
 if(existing.some(k=>!seen.has(k.name)))throw Error('target_has_unrelated_images');
 const manifest=[];
 for(let offset=0;offset<before.length;offset+=4){
  const group=before.slice(offset,offset+4);
  const values=await Promise.all(group.map(k=>source(`/storage/kv/namespaces/${SOURCE.kv}/values/${encodeURIComponent(k.name)}`,{},true)));
  const entries=group.map((k,i)=>({key:k.name,value:values[i].toString('base64'),base64:true,...(k.metadata!==undefined?{metadata:k.metadata}:{}),...(k.expiration?{expiration:k.expiration}:{})}));
  await target(`/storage/kv/namespaces/${ns}/bulk`,{method:'PUT',body:JSON.stringify(entries)});
  const copies=await Promise.all(group.map(k=>target(`/storage/kv/namespaces/${ns}/values/${encodeURIComponent(k.name)}`,{},true)));
  for(let i=0;i<group.length;i++){if(digest(copies[i])!==digest(values[i]))throw Error('image_bytes_mismatch');manifest.push([group[i].name,digest(values[i])]);}
  if(offset%40===0)console.log('images_verified_'+Math.min(offset+4,before.length));
 }
 if(JSON.stringify(before)!==JSON.stringify(await keys(source,SOURCE.kv)))throw Error('source_images_changed');
 if(JSON.stringify(before)!==JSON.stringify(await keys(target,ns)))throw Error('image_metadata_mismatch');
 return {count:before.length,hash:digest(JSON.stringify(manifest))};
}
async function copy(source,target){
 const preflight=await plan(source,target);if(Object.values(preflight).some(x=>!x.ok))throw Error('preflight_failed');
 if(preflight.target_domain.subdomain!=='sam-jesse')throw Error('wrong_target_domain');
 let db=preflight.target_databases.databases.find(x=>x.name==='japansterdam')?.id;
 if(!db)db=(await post(target,'/d1/database',{name:'japansterdam',primary_location_hint:'weur'})).result.uuid;
 let ns=preflight.target_namespaces.namespaces.find(x=>x.name==='japansterdam-images')?.id;
 if(!ns)ns=(await post(target,'/storage/kv/namespaces',{title:'japansterdam-images'})).result.id;
 console.log(JSON.stringify({targetDatabase:db,targetImages:ns}));
 const before=await snapshot(source,SOURCE.database,true);
 const targetSchema=await query(target,db,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'");
 if(!targetSchema.length){console.log('database_copy_started');await importSQL(target,db,rewrite(await exportSQL(source,SOURCE.database)));}
 const copied=await snapshot(target,db);
 if(JSON.stringify(before)!==JSON.stringify(copied))throw Error('database_copy_mismatch');
 console.log('database_verified');
 const images=await copyImages(source,target,ns);
 if(JSON.stringify(before)!==JSON.stringify(await snapshot(source,SOURCE.database,true)))throw Error('source_database_changed');
 await query(target,db,'CREATE TABLE IF NOT EXISTS backend_account_transfer (source TEXT PRIMARY KEY,verified_at TEXT NOT NULL,manifest TEXT NOT NULL)');
 await query(target,db,'INSERT OR REPLACE INTO backend_account_transfer VALUES (?,?,?)',[SOURCE.database,new Date().toISOString(),JSON.stringify({database:before,images})]);
 console.log(JSON.stringify({verified:true,targetDatabase:db,targetImages:ns,tables:Object.fromEntries(Object.entries(before.tables).map(([k,v])=>[k,v.rows])),images:images.count}));
}
async function main(){
 const source=connection(SOURCE.account,process.env.SOURCE_CLOUDFLARE_API_TOKEN),target=connection(TARGET.account,process.env.TARGET_CLOUDFLARE_API_TOKEN);
 const phase=process.env.TRANSFER_PHASE||'plan';
 if(phase==='copy'){await copy(source,target);return;}
 if(phase!=='plan')throw Error('invalid_phase');
 const result=await plan(source,target);console.log(JSON.stringify(result,null,2));
 if(Object.values(result).some(x=>!x.ok))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'transfer_failed');process.exitCode=1;});
