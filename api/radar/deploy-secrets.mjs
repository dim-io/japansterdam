import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import policy from '../../tools/deal-radar/pilot-v3.json' with { type:'json' };
import { freePlanDecision } from './free-plan.mjs';
const keys = ['APIFY_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
if (keys.some((key) => !process.env[key])) throw new Error('Vereiste radar-secrets ontbreken; geen lege waarden gepubliceerd');
// Verify a free account before enabling GPU calls. Unknown/paid plans stay off.
let decision = freePlanDecision({},policy);
const accountId = /account_id\s*=\s*"([a-f0-9]{32})"/.exec(readFileSync('radar/wrangler.toml','utf8'))?.[1];
if (!accountId) throw Error('Radaraccount ontbreekt');
// A confirmation for Dimi's account must never authorize AI on Sam's account.
if (policy.visionAccountConfirmation?.accountId !== accountId) decision={allowed:false,basis:'new_account_requires_confirmation'};
try {
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/'+accountId+'/subscriptions', {
    headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN }, redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  decision = freePlanDecision({ok:response.ok,data,status:response.status},policy.visionAccountConfirmation?.accountId===accountId?policy:{...policy,visionAccountConfirmation:null});
  console.log('Gratis AI-account bevestigd: ' + decision.allowed + ' · bron: ' + decision.basis + ' (controle HTTP ' + response.status + ').');
} catch { console.log('Account-API niet bereikbaar; beslissing: ' + decision.basis); }
const input = JSON.stringify({ ...Object.fromEntries(keys.map((key) => [key, process.env[key]])), VISION_FREE_CONFIRMED: String(decision.allowed) });
// Secrets travel only through stdin into Cloudflare's encrypted secret store.
const result = spawnSync('node_modules/.bin/wrangler', ['secret', 'bulk', '--config', 'radar/wrangler.toml'], {
  input, stdio: ['pipe', 'inherit', 'inherit'], env: process.env,
});
if (result.status !== 0) throw new Error('Radar-secrets niet gepubliceerd');
