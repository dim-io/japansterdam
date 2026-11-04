import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { sendTelegram } from './radar.mjs';

export async function connect({ token, code, username, fetcher = fetch, now = Date.now() }) {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token || '')) throw new Error('Voeg eerst TELEGRAM_BOT_TOKEN toe aan de GitHub Actions-secrets.');
  if (!/^[a-f0-9]{32}$/.test(code || '')) throw new Error('Plak de volledige koppelcode van 32 tekens.');
  const api = async (method, data = {}) => {
    let response;
    try {
      response = await fetcher('https://api.telegram.org/bot' + token + '/' + method, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        redirect: 'error', signal: AbortSignal.timeout(20_000),
      });
    } catch { throw new Error('Telegram is niet bereikbaar. Probeer de koppeling later opnieuw.'); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error('Telegram heeft het verzoek niet bevestigd. Controleer het bottoken.');
    return result.result;
  };
  const bot = await api('getMe');
  if (bot.username?.toLowerCase() !== username.toLowerCase()) throw new Error('Het opgeslagen token hoort niet bij de opgegeven radarbot.');
  if ((await api('getWebhookInfo')).url) throw new Error('Deze bot gebruikt al een webhook. De bestaande koppeling wordt niet gewijzigd.');
  const updates = await api('getUpdates', { limit: 100, timeout: 0, allowed_updates: ['message'] });
  const matches = updates.map((u) => u.message).filter((m) => m && m.text === '/start ' + code
    && m.chat?.type === 'private' && m.from?.id === m.chat.id
    && Number.isInteger(m.date) && now - m.date * 1000 <= 15 * 60_000 && m.date * 1000 <= now + 60_000);
  const chats = [...new Set(matches.map((m) => String(m.chat.id)))];
  if (chats.length !== 1) throw new Error('Geen unieke recente bevestiging gevonden. Open de Telegram-koppellink, druk op Start en probeer binnen 15 minuten opnieuw.');
  const chatId = chats[0];
  await sendTelegram('Japansterdam Radar: je persoonlijke chat is gevonden en dit testbericht is aangekomen. Bewaar de chat-ID nog in GitHub. De Vinted-monitor staat nog uit totdat de advertentiebron werkt.', token, chatId, fetcher);
  return chatId;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const chatId = await connect({ token: process.env.TELEGRAM_BOT_TOKEN, code: process.env.TELEGRAM_PAIRING_CODE, username: process.env.TELEGRAM_BOT_USERNAME });
    console.log('Testbericht verzonden. TELEGRAM_CHAT_ID=' + chatId);
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### Telegram-test geslaagd\n\nSla in [Actions-secrets](https://github.com/dim-io/japansterdam/settings/secrets/actions) een nieuw secret op:\n\n- **Name:** \`TELEGRAM_CHAT_ID\`\n- **Secret:** \`${chatId}\`\n\nHet bottoken is niet getoond. De Vinted-monitor is nog niet geactiveerd.\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
