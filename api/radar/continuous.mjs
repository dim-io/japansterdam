// Daily reservations preserve finite scan guards and never reset existing counters.
export function continuousPolicy(policy, operation, now=Date.now()) {
  if(!operation.enabled||operation.mode!=='continuous')return policy;
  if(operation.dailyScanLimit!==288||!Number.isFinite(Date.parse(operation.authorizedAt))||now<Date.parse(operation.authorizedAt))throw Error('Invalid continuous authorization');
  const start=new Date(now);start.setUTCHours(0,0,0,0);
  return {...policy,enabled:true,id:'continuous-'+start.toISOString().slice(0,10),
    startsAt:start.toISOString(),endsAt:new Date(+start+86400000).toISOString(),maxAttempts:288,
    mode:'fresh-rotation',sourceProvider:'topapi-monitor',sourceMode:'new-only',maxCostPerMonitorRunUsd:.015,
    continuous:{authorizedAt:operation.authorizedAt,previousPilotId:policy.id,historyStartsAt:policy.startsAt}};
}
export async function initializeContinuousDay(query,policy) {
  if(!policy.continuous)return;
  if((await query('SELECT id FROM radar_control WHERE id=?',[policy.id])).length)return;
  if(!(await query('SELECT id FROM radar_control WHERE id=?',[policy.continuous.previousPilotId])).length)throw Error('Previous radar history missing');
  // Include yesterday's research queue. Seen IDs are already deduplicated globally.
  const yesterday='continuous-'+new Date(Date.parse(policy.startsAt)-86400000).toISOString().slice(0,10);
  for(const source of [policy.continuous.previousPilotId,yesterday]) {
    await query('INSERT OR IGNORE INTO radar_research SELECT ?,item_id,data,priority,state,photo_state,first_seen,last_seen FROM radar_research WHERE pilot_id=?',[policy.id,source]);
  }
  await query('INSERT OR IGNORE INTO radar_control (id) VALUES (?)',[policy.id]);
}
