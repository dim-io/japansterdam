import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('workerd transport supports authenticated requests and refuses redirects without forwarding secrets', async () => {
  const code = await fs.readFile(new URL('../../tools/deal-radar/scoring.mjs', import.meta.url), 'utf8');
  let calls = 0, redirect = false;
  const runtime = new Miniflare(convertV4MiniflareOptions({ compatibilityDate: '2026-10-30', modules: true,
    script: code + `\nexport default { async fetch(request) { if (new URL(request.url).pathname === '/legacy') { try { await fetch('https://api.telegram.org/', {redirect:'error'}); return Response.json({rejected:false}); } catch { return Response.json({rejected:true}); } } try { const id = await sendTelegram('test', '123:fixture', '42'); return Response.json({id}); } catch { return Response.json({rejected:true}); } } };`,
    outboundService: async (request) => {
      calls++;
      assert.equal(new URL(request.url).hostname, 'api.telegram.org');
      if (redirect) return new Response('', {status:302,headers:{Location:'https://untrusted.invalid/'}});
      return Response.json({ok:true,result:{message_id:77}});
    },
  }));
  try {
    const legacy = await (await runtime.dispatchFetch('https://worker.test/legacy')).json();
    assert.equal(legacy.rejected,true);assert.equal(calls,0);
    const first = await (await runtime.dispatchFetch('https://worker.test/')).json();
    assert.equal(first.id,77);assert.equal(calls,1);
    redirect=true;
    const second=await(await runtime.dispatchFetch('https://worker.test/')).json();
    assert.equal(second.rejected,true);assert.equal(calls,2);
  } finally { await runtime.dispose(); }
});
