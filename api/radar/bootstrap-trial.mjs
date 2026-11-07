import {pathToFileURL} from 'node:url';
import {client,TARGET,SOURCE} from './account-migration.mjs';
import {inWindow,scanSelection} from './worker.mjs';
import readiness from './owner-readiness.json' with {type:'json'};
import policy from '../../tools/deal-radar/pilot-v3.json' with {type:'json'};
export async function bootstrapTrial(query,p=policy,now=Date.now()){
  if(!/^pilot-\d{4}-\d{2}-\d{2}$/.test(p.id)||p.id===p.previousPilotId)throw Error('Ongeldig proefvenster');
  if((await query('SELECT verified FROM radar_transfer WHERE id=?',[SOURCE.database]))[0]?.verified!==1)throw Error('Accountoverdracht niet geverifieerd');
  if((await query('SELECT id FROM radar_control WHERE id=?',[p.id])).length)return {alreadyInitialized:true};
  if(p.maxAttempts!==24||!inWindow(Date.parse(p.startsAt),p)||now>=Date.parse(p.endsAt)||Date.parse(p.startsAt)-now>3600000)throw Error('Ongeldig proefvenster');
  scanSelection(p,0);scanSelection(p,1);
  if(!(await query('SELECT id FROM radar_control WHERE id=?',[p.previousPilotId])).length)throw Error('Voorgaande historie ontbreekt');
  const smoke=(await query('SELECT smoke_ok FROM radar_vision_control WHERE id=?',[readiness.id]))[0];
  const proof=(await query('SELECT state,created_at FROM radar_photo_checks WHERE pilot_id=? AND item_id=? AND evidence_key=?',[readiness.id,'smoke-v2','empty-pixel-regression-v2']))[0];
  if(readiness.accountId!==TARGET.account||smoke?.smoke_ok!==1||proof?.state!=='ready'||now-proof.created_at>86400000)throw Error('Beeldtest op eigen account ontbreekt');
  await query('INSERT OR IGNORE INTO radar_seen SELECT ?,item_id,price,observed_at FROM radar_seen WHERE pilot_id=?',[p.id,p.previousPilotId]);
  await query('INSERT OR IGNORE INTO radar_alerts SELECT ?,item_id,price,delivery,message_id,attempted_at FROM radar_alerts WHERE pilot_id=?',[p.id,p.previousPilotId]);
  await query('INSERT OR IGNORE INTO radar_research SELECT ?,item_id,data,priority,state,photo_state,first_seen,last_seen FROM radar_research WHERE pilot_id=?',[p.id,p.previousPilotId]);
  await query("INSERT OR IGNORE INTO radar_vision_control (id,smoke_ok,last_outcome,last_check_at) VALUES (?,1,'empty_image_correctly_inconclusive',?)",[p.id,proof.created_at]);
  // Publish the scan reservation last, after historical deduplication is complete.
  await query('INSERT OR IGNORE INTO radar_control (id) VALUES (?)',[p.id]);
  return {alreadyInitialized:false,historyPreserved:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)bootstrapTrial(client(TARGET,process.env.CLOUDFLARE_API_TOKEN)).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Nieuwe proef niet geïnitialiseerd; geen counters gereset.');process.exitCode=1;});
