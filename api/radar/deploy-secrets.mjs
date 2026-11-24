import {privateConfigBindings} from './private-config-bindings.mjs';
import { spawnSync } from 'node:child_process';
import { requirePrivateRuntime } from './private-runtime.mjs';
import { freePlanDecision } from './free-plan.mjs';
const keys = ['APIFY_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID','RADAR_PRIVATE_CONFIG'];
if (keys.some((key) => !process.env[key])) throw new Error('Vereiste radar-secrets ontbreken; geen lege waarden gepubliceerd');
const {policy,deployment}=requirePrivateRuntime(process.env);
// Verify a free account before enabling GPU calls. Unknown/paid plans stay off.
let decision = freePlanDecision({},policy);
const accountId = deployment.accountId;
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
const input = JSON.stringify({ ...Object.fromEntries(keys.filter(key=>key!=='RADAR_PRIVATE_CONFIG').map((key) => [key, process.env[key]])), ...privateConfigBindings(process.env.RADAR_PRIVATE_CONFIG), VISION_FREE_CONFIRMED: String(decision.allowed) });
// Secrets travel only through stdin into Cloudflare's encrypted secret store.
const result = spawnSync('node_modules/.bin/wrangler', ['secret', 'bulk', '--config', 'radar/.wrangler.generated.toml'], {
  input, stdio: ['pipe', 'inherit', 'inherit'], env: process.env,
});
if (result.status !== 0) throw new Error('Radar-secrets niet gepubliceerd');
