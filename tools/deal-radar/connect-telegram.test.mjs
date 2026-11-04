import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from './connect-telegram.mjs';

const code = 'abcdef0123456789abcdef0123456789';
const now = Date.now();
const message = { text: '/start ' + code, chat: { id: 123, type: 'private' }, from: { id: 123 }, date: Math.floor(now / 1000) };
const options = { token: '123:secret', code, username: 'japansterdam_radar_bot', now };
function mock(messages, sent, bot = 'japansterdam_radar_bot') {
  return async (url, request) => {
    const method = url.split('/').pop();
    const result = method === 'getMe' ? { username: bot } : method === 'getWebhookInfo' ? { url: '' } : method === 'getUpdates' ? messages.map((message) => ({ message })) : { message_id: 1 };
    if (method === 'sendMessage') sent.push(JSON.parse(request.body));
    return Response.json({ ok: true, result });
  };
}
test('only a recent private start confirmation receives the test message', async () => {
  const sent = [];
  assert.equal(await connect({ ...options, fetcher: mock([message], sent) }), '123');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, '123');
});
test('wrong codes, old messages, group chats and ambiguous recipients do not receive messages', async () => {
  for (const messages of [[], [{ ...message, text: '/start wrong' }], [{ ...message, date: Math.floor(now / 1000) - 3600 }],
    [{ ...message, chat: { id: 123, type: 'group' } }], [message, { ...message, chat: { id: 456, type: 'private' }, from: { id: 456 } }]]) {
    const sent = [];
    await assert.rejects(connect({ ...options, fetcher: mock(messages, sent) }), /Geen unieke/);
    assert.equal(sent.length, 0);
  }
});
test('wrong bot and missing credentials fail without exposing token', async () => {
  await assert.rejects(connect({ ...options, token: '' }), /TELEGRAM_BOT_TOKEN/);
  await assert.rejects(connect({ ...options, fetcher: mock([message], [], 'other_bot') }), /hoort niet/);
  await assert.rejects(connect({ ...options, fetcher: async () => { throw new Error('123:secret'); } }), (e) => !e.message.includes('123:secret'));
});
