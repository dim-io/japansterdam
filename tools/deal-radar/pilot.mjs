import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { probe } from './apify-probe.mjs';
import { estimateFromShop, missingReferenceReason } from './trial.mjs';
import { assess, alertText, fetchJson, identifyBrand, sendTelegram, shouldAlert } from './radar.mjs';

async function persist(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + '.tmp', JSON.stringify(value));
  await fs.rename(file + '.tmp', file);
}

export async function pilot({ env = process.env, fetcher = fetch, probeFn = probe, now = Date.now(), settings, stateFile, log = console.log } = {}) {
  const config = JSON.parse(await fs.readFile(new URL('./config.json', import.meta.url), 'utf8'));
  settings ||= JSON.parse(await fs.readFile(new URL('./pilot.json', import.meta.url), 'utf8'));
  const start = Date.parse(settings.startsAt), end = Date.parse(settings.endsAt);
  // Fixed window: re-running a workflow never extends this test automatically.
  if (!settings.enabled || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * 3_600_000
    || now < start || now >= end) { log('PILOT_INACTIEF: buiten het vaste proefvenster.'); return { inactive: true }; }
  if (!Number.isInteger(settings.maxAttempts) || settings.maxAttempts < 1 || settings.maxAttempts > 25) throw new Error('Ongeldige proeflimiet.');
  if (!env.APIFY_TOKEN || !/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN || '') || !/^\d+$/.test(env.TELEGRAM_CHAT_ID || '')) throw new Error('De Apify- of Telegraminstellingen ontbreken.');
  stateFile ||= new URL('./.state/pilot.json', import.meta.url).pathname;
  let state;
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Proefstatus is onleesbaar; geen scan uitgevoerd.'); state = { attempts: 0, slots: {}, alerts: {} }; }
  if (!Number.isInteger(state.attempts) || !state.slots || !state.alerts) throw new Error('Ongeldige proefstatus.');
  const slot = Math.floor(now / 3_600_000);
  if (state.slots[slot]) { log('Dit uur is al gecontroleerd; geen dubbele scan.'); return { skipped: true }; }
  if (state.attempts >= Math.min(settings.maxAttempts, 25)) { log('De proeflimiet is bereikt; geen nieuwe scan.'); return { inactive: true }; }
  // Without a valuation source we stop before spending scraping credits.
  const products = await fetchJson(config.inventoryUrl, { fetcher });
  if (!Array.isArray(products) || !products.length) throw new Error('Shopreferenties ontbreken; geen scan uitgevoerd.');
  const brands = Object.entries(settings.brands || {});
  if (!brands.length || brands.some(([name, id]) => !identifyBrand(name, config) || !/^\d+$/.test(id))) throw new Error('Ongeldige merkselectie.');
  // Rotate actual attempts, so a missed schedule cannot starve one brand.
  const [selectedBrand, brandId] = brands[state.attempts % brands.length];
  const previousScanAt = state.lastScanAt;
  state.attempts++;
  state.slots[slot] = true;
  await persist(stateFile, state);
  const result = await probeFn({ token: env.APIFY_TOKEN, brandIds: brandId, fetcher });
  const items = result.items.filter((item) => identifyBrand(item.brand, config) === identifyBrand(selectedBrand, config));
  const baseline = !state.seen;
  state.seen ||= {};
  const uniqueItems = [...new Map(items.map((item) => [item.url, item])).values()];
  const newListings = uniqueItems.filter((item) => !state.seen[item.url]).length;
  for (const item of uniqueItems) state.seen[item.url] = { price: item.price, lastObservedAt: now };
  state.lastScanAt = now;
  await persist(stateFile, state);
  const decisions = uniqueItems.map((item) => {
    const valuation = estimateFromShop(item, products, config);
    const deal = assess({ ...item, ...(valuation ? { valuation } : {}) }, config, now);
    if (deal.reason === 'Geen passende prijsreferentie: flipwaarde blijft onbekend') deal.reason = missingReferenceReason(item, products, config);
    return { item, deal };

  });
  let sent = 0;
  const candidates = decisions.filter(({ deal }) => deal.eligible && shouldAlert(deal, state))
    .sort((a, b) => b.deal.score - a.deal.score);
  for (const { deal } of candidates) {
    // Recheck state so duplicate records in one result set cannot notify twice.
    if (!shouldAlert(deal, state)) continue;
    const text = (deal.valuationKind === 'estimate' ? 'RADARPROEF — KANDIDAAT OP BASIS VAN SCHATTING\n\n' : 'RADARPROEF\n\n') + alertText(deal);
    const messageId = await sendTelegram(text, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, fetcher);
    state.alerts[deal.id] = { price: deal.price, sentAt: now, messageId };
    await persist(stateFile, state);
    sent++;
  }
  const report = { pilot: true, runId: result.runId, attempts: state.attempts, checked: uniqueItems.length, sent,
    scannedAt: new Date(now).toISOString(), scope: Object.keys(settings.brands), selectedBrand, endsAt: settings.endsAt,
    outsideBrandFilter: result.items.length - items.length,
    noveltyBaseline: baseline, newListings: baseline ? null : newListings,
    repeatedListings: baseline ? null : uniqueItems.length - newListings,
    scanGapHours: previousScanAt ? Math.round((now - previousScanAt) / 360000) / 10 : null,
    priced: decisions.filter(({ deal }) => typeof deal.score === 'number').length,
    decisions: decisions.map(({ item, deal }) => ({ title: item.title, price: item.price, brand: item.brand, sourceUploadAge: item.sourceUploadAge || null, score: deal.score ?? null, reason: deal.reason })) };
  log(JSON.stringify(report));
  if (env.GITHUB_STEP_SUMMARY) {
    const safe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n`]/g, ' ');
    const summary = [
      '## Radarproef — scanverslag', '',
      `Gecontroleerd: ${report.scannedAt} · merk: ${selectedBrand} · poging ${state.attempts}/${settings.maxAttempts}.`,
      previousScanAt ? `Tijd sinds de vorige geslaagde scan: ${report.scanGapHours} uur.${report.scanGapHours > 2 ? ' **Planningsgat: geen betrouwbare uurdekking.**' : ''}` : 'Eerste scan met de nieuwe tijdregistratie; eerdere planningsgaten zijn niet terug te reconstrueren.',
      baseline ? 'Nieuwheidsregistratie gestart; deze eerste set is de nulmeting.' : `${newListings} niet eerder gezien · ${report.repeatedListings} eerder gezien. Dit zegt niets over de werkelijke uploaddatum.`,
      `${report.priced}/${report.checked} met passende prijsreferentie · ${sent} Telegrammeldingen · ${report.outsideBrandFilter} resultaten buiten het gevraagde merk genegeerd.`, '',
      ...report.decisions.map((d) => `- ${safe(d.title)} · €${d.price} · ${d.score === null ? 'geen score' : d.score + '/10'}: ${safe(d.reason)}`), '',
      'Resultaten opnieuw opgehaald betekent niet dat de advertenties nieuw geplaatst zijn. Onbekende waarde levert geen koopjesmelding op.',
      `Vaste stop: ${settings.endsAt}.`, '',
    ].join('\n');
    await fs.appendFile(env.GITHUB_STEP_SUMMARY, summary);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await pilot(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
