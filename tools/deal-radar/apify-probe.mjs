import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { listingUrl } from './radar.mjs';

export { normalizeRow, probe } from './provider.mjs';
import { probe } from './provider.mjs';

const safeText = (value) => String(value).replace(/[\r\n]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_[\]{}|]/g, '\\$&');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await probe({ token: process.env.APIFY_TOKEN });
    console.log(JSON.stringify({ runId: result.runId, returned: result.returned, validUnder40: result.items.length, confirmedAvailable: result.confirmedAvailable, usageTotalUsd: result.usageTotalUsd }));
    const summary = ['## Vinted-proefscan', '', `Apify-run: https://console.apify.com/view/runs/${result.runId}`, '',
      `Aangevraagde kostenlimiet: $${result.maxCostUsd.toFixed(2)}. Maximaal drie resultaten, één merk.`, '',
      `${result.items.length} geldige EUR-advertenties tot €40; ${result.confirmedAvailable} met expliciet bevestigde beschikbaarheid.`, '',
      ...result.items.map((i) => `- **${safeText(i.title)}** · €${i.price.toFixed(2)} · ${safeText(i.brand)} · staat: ${safeText(i.condition || 'onbekend')} · beschikbaar: ${i.available === null ? 'onbekend' : i.available ? 'ja' : 'nee'} · [Bekijk op Vinted](${i.url})`), '',
      '**Dit is alleen een verbindingstest.** Er zijn geen verkoopvergelijkingen opgehaald, geen dealscores berekend en geen koopjesalerts verstuurd. Het uurschema is niet aangezet.', '',
      result.items.length ? 'De ontvangen velden kunnen nu worden gecontroleerd vóór verdere aansluiting.' : 'Geen bruikbare items ontvangen. Dat bewijst niet dat er geen aanbiedingen bestaan; deze bron is nog niet gevalideerd.', '',
    ].join('\n');
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
