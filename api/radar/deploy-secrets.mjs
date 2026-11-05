import { spawnSync } from 'node:child_process';
const keys = ['APIFY_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
if (keys.some((key) => !process.env[key])) throw new Error('Vereiste radar-secrets ontbreken; geen lege waarden gepubliceerd');
const input = JSON.stringify(Object.fromEntries(keys.map((key) => [key, process.env[key]])));
// Secrets travel only through stdin into Cloudflare's encrypted secret store.
const result = spawnSync('node_modules/.bin/wrangler', ['secret', 'bulk', '--config', 'radar/wrangler.toml'], {
  input, stdio: ['pipe', 'inherit', 'inherit'], env: process.env,
});
if (result.status !== 0) throw new Error('Radar-secrets niet gepubliceerd');
