// One-time, private Cloudflare-to-Cloudflare radar transfer. Data stays in memory
// and authenticated API requests: never in Git, logs, caches or artifacts.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import policy from '../../tools/deal-radar/pilot-v2.json' with {type:'json'};

export const SOURCE={account:'0e3359947b78095a7afd9ce36f5cac6f',database:'4e52cd67-a370-400b-b79b-ca1527cc03de'};
export const TARGET={account:'81a93f1ef55a892620ab77cf0f8163f6',database:'41d7b993-8791-4b19-b8fa-5a5db6eeda7e'};
export const TABLES=['radar_control','radar_seen','radar_alerts','radar_vision_control','radar_photo_checks','radar_vision_daily','radar_research','radar_research_limits','radar_research_tests'];
const ident=name=>{if(!/^[a-z_]+$/.test(name))throw Error('invalid_identifier');return '"'+name+'"';};
export function digest(rows,columns){return createHash('sha256').update(JSON.stringify(rows.map(r=>columns.map(c=>r[c])).map(JSON.stringify).sort())).digest('hex');}
export function inserts(table,rows,columns){
  if(!TABLES.includes(table))throw Error('table_not_allowed');
  const size=Math.floor(90/columns.length);if(size<1)throw Error('too_many_columns');
  const queries=[];
  for(let i=0;i<rows.length;i+=size){const batch=rows.slice(i,i+size);queries.push({sql:`INSERT OR IGNORE INTO ${ident(table)} (${columns.map(ident).join(',')}) VALUES ${batch.map(()=>`(${columns.map(()=>'?').join(',')})`).join(',')}`,params:batch.flatMap(r=>columns.map(c=>r[c]))});}
  return queries;
}
export function client(connection,token,fetcher=fetch){
  return async(sql,params=[])=>{
    if(!token)throw Error('token_missing');
    let response,data;
    try {response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${connection.account}/d1/database/${connection.database}/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),redirect:'error',signal:AbortSignal.timeout(60000)});data=await response.json();}
    catch {throw Error('database_transport_failed');}
    if(!response.ok||data.success!==true||!Array.isArray(data.result)||data.result.some(r=>r.success===false))throw Error('database_query_http_'+response.status);
    return data.result[0]?.results||[];
  };
}
export async function transfer(source,target,{migrate=false,now=Date.now()}={}){
  const exists=await target("SELECT name FROM sqlite_master WHERE type='table' AND name='radar_transfer'");
  if(exists.length){const marker=await target('SELECT verified FROM radar_transfer WHERE id=?',[SOURCE.database]);if(marker[0]?.verified===1)return {alreadyVerified:true};}
  if(!migrate)throw Error('migration_not_verified');
  if(policy.enabled&&Date.parse(policy.endsAt)>now)throw Error('source_trial_must_be_finished');
  const schemas=await source(`SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN (${TABLES.map(()=>'?').join(',')})`,TABLES);
  if(schemas.length!==TABLES.length)throw Error('source_schema_incomplete');
  const counts={};
  for(const table of TABLES){
    const schema=schemas.find(s=>s.name===table)?.sql;
    if(!schema||!/^CREATE TABLE\s/i.test(schema)||!schema.includes(table))throw Error('unexpected_schema');
    const total=(await source(`SELECT COUNT(*) AS n FROM ${ident(table)}`))[0]?.n;
    if(!Number.isInteger(total)||total>20000)throw Error('source_size_unexpected');
    const rows=await source(`SELECT * FROM ${ident(table)} LIMIT 20001`);
    if(rows.length!==total)throw Error('source_changed');
    const columns=(await source(`PRAGMA table_info(${ident(table)})`)).map(c=>c.name);
    await target(schema.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?/i,'CREATE TABLE IF NOT EXISTS '));
    for(const query of inserts(table,rows,columns))await target(query.sql,query.params);
    const copied=await target(`SELECT * FROM ${ident(table)} LIMIT 20001`);
    const sourceAgain=await source(`SELECT * FROM ${ident(table)} LIMIT 20001`);
    if(digest(rows,columns)!==digest(copied,columns)||digest(rows,columns)!==digest(sourceAgain,columns))throw Error('transfer_verification_failed');
    counts[table]=rows.length;
  }
  // Reset only environment readiness on the new account, never spending or alerts.
  // Historical smoke success on Dimi's account is not proof of AI readiness here.
  await target("UPDATE radar_vision_control SET smoke_ok=0,last_outcome='account_migration_requires_smoke'");
  await target('CREATE TABLE IF NOT EXISTS radar_transfer (id TEXT PRIMARY KEY,verified INTEGER NOT NULL,completed_at INTEGER NOT NULL)');
  await target('INSERT OR REPLACE INTO radar_transfer (id,verified,completed_at) VALUES (?,1,?)',[SOURCE.database,now]);
  return {alreadyVerified:false,counts};
}

async function main(){
  const source=client(SOURCE,process.env.SOURCE_CLOUDFLARE_API_TOKEN);
  const target=client(TARGET,process.env.CLOUDFLARE_API_TOKEN);
  if(process.env.STOP_OLD_RADAR==='true'){
    if(!(await target('SELECT verified FROM radar_transfer WHERE id=?',[SOURCE.database]))[0]?.verified)throw Error('migration_not_verified');
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${SOURCE.account}/workers/scripts/japansterdam-radar/schedules`,{method:'PUT',headers:{Authorization:'Bearer '+process.env.SOURCE_CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:'[]',redirect:'error',signal:AbortSignal.timeout(30000)});
    const data=await response.json();if(!response.ok||!data.success)throw Error('old_schedule_not_stopped');
    console.log('Oude radarplanning uitgeschakeld; webshop ongewijzigd.');return;
  }
  const result=await transfer(source,target,{migrate:process.env.MIGRATE_RADAR==='true'});
  console.log(JSON.stringify({verified:true,...result}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{const code=/^[a-z_0-9]+$/.test(error.message)?error.message:'migration_failed';console.error('Radaroverdracht gestopt: '+code);process.exitCode=1;});
