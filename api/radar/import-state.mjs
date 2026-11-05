import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PILOT_ID } from './worker.mjs';

// Future backend deployments do not depend on an old GitHub cache.
const exists = spawnSync('node_modules/.bin/wrangler', ['d1', 'execute', 'japansterdam', '--remote', '--json', '--command', `SELECT COUNT(*) AS n FROM radar_control WHERE id='${PILOT_ID}'`], { encoding: 'utf8', env: process.env });
if (exists.status !== 0) throw new Error('Bestaande database-status niet te controleren');
const current = JSON.parse(exists.stdout);
if (current[0]?.results?.[0]?.n > 0) {
  console.log('Radarstatus staat al in de database; geen import of reset.');
  process.exit(0);
}

// Never silently reset the spending or delivery history during migration.
const state = JSON.parse(await fs.readFile('../tools/deal-radar/.state/pilot.json', 'utf8'));
if (!Number.isInteger(state.attempts) || state.attempts < 0 || state.attempts > 25 || !state.slots || !state.alerts) throw new Error('Bestaande radarstatus ontbreekt of is ongeldig; geen reset toegestaan');
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const num = (n) => { if (!Number.isFinite(n)) throw new Error('Ongeldige statuswaarde'); return n; };
const slots = Object.keys(state.slots).map(Number);
const lastSlot = slots.length ? Math.max(...slots) : -1;
const lines = [`INSERT OR IGNORE INTO radar_control (id,attempts,last_slot,last_attempt_at,last_scan_at) VALUES (${q(PILOT_ID)},${state.attempts},${num(lastSlot)},${lastSlot >= 0 ? lastSlot * 3600000 : 'NULL'},${state.lastScanAt ? num(state.lastScanAt) : 'NULL'});`];
for (const [url, seen] of Object.entries(state.seen || {})) {
  const id = /\/items\/(\d+)/.exec(url)?.[1];
  if (!id) throw new Error('Ongeldige advertentiestatus');
  lines.push(`INSERT OR IGNORE INTO radar_seen (pilot_id,item_id,price,observed_at) VALUES (${q(PILOT_ID)},${q(id)},${num(seen.price)},${num(seen.lastObservedAt)});`);
}
for (const [id, alert] of Object.entries(state.alerts)) {
  if (!/^\d+$/.test(id) || !Number.isInteger(alert.messageId)) throw new Error('Ongeldige bezorgstatus');
  lines.push(`INSERT OR IGNORE INTO radar_alerts (pilot_id,item_id,price,delivery,message_id,attempted_at) VALUES (${q(PILOT_ID)},${q(id)},${num(alert.price)},'sent',${alert.messageId},${num(alert.sentAt)});`);
}
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-transfer-'));
try {
  const file = path.join(dir, 'transfer.sql');
  await fs.writeFile(file, lines.join('\n'));
  const result = spawnSync('node_modules/.bin/wrangler', ['d1', 'execute', 'japansterdam', '--remote', '--file', file], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw new Error('Statusoverdracht niet bevestigd');
  console.log('Radarstatus overgezet; bestaande databasegegevens zijn niet gereset.');
} finally { await fs.rm(dir, { recursive: true, force: true }); }
