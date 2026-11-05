import { spawnSync } from 'node:child_process';
const keys = ['APIFY_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
if (keys.some((key) => !process.env[key])) throw new Error('Vereiste radar-secrets ontbreken; geen lege waarden gepubliceerd');
// Verify a free account before enabling GPU calls. Unknown/paid plans stay off.
let freeConfirmed = false;
try {
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/0e3359947b78095a7afd9ce36f5cac6f/subscriptions', {
    headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN }, redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  // Empty account subscription list is an unambiguous free account. Do not infer
  // a plan from worker names or silently enable on an authorization failure.
  freeConfirmed = response.ok && data.success === true && Array.isArray(data.result) && data.result.length === 0
    && (!data.result_info?.total_count || data.result_info.total_count === 0);
  console.log('Gratis AI-account bevestigd: ' + freeConfirmed + ' (controle HTTP ' + response.status + ').');
} catch { console.log('Gratis AI-account niet te controleren; fotoanalyse blijft uit.'); }
const input = JSON.stringify({ ...Object.fromEntries(keys.map((key) => [key, process.env[key]])), VISION_FREE_CONFIRMED: String(freeConfirmed) });
// Secrets travel only through stdin into Cloudflare's encrypted secret store.
const result = spawnSync('node_modules/.bin/wrangler', ['secret', 'bulk', '--config', 'radar/wrangler.toml'], {
  input, stdio: ['pipe', 'inherit', 'inherit'], env: process.env,
});
if (result.status !== 0) throw new Error('Radar-secrets niet gepubliceerd');
