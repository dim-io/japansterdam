Warning: truncated output (original token count: 12697)
Total output lines: 302

# Japansterdam vondstenradar

**Huidige status (7 november 2026): een nieuwe, begrensde 24-uurs proef op Sams eigen Cloudflare-account.** Needles en Kapital worden tot €70 gezocht; Engineered Garments en orSlow tot €40. De webshop blijft op Dimi's account. Er is geen betaald abonnement afgesloten en de radar koopt nooit automatisch iets.

### Eigen account: radar en statistieken

- Radarstatus: https://japansterdam-radar.sam-jesse.workers.dev/status
- Web Analytics: https://dash.cloudflare.com/81a93f1ef55a892620ab77cf0f8163f6/web-analytics
- De afzonderlijke D1-database heet `japansterdam-radar`. Alle negen radartabellen zijn via geauthenticeerde API-aanvragen in geheugen overgezet en inhoudelijk vergeleken. Geen ruwe advertenties, accountdata of sleutels worden in GitHub-logs, caches of artifacts gezet. Shopgebruikers, bestellingen, conceptproducten en foto's zijn niet gekopieerd.
- De bestaande 24 scanpogingen, eerdere bezorgreserveringen en vijf onderzoekskandidaten zijn behouden. De nieuwe omgeving vereist een eigen AI-readinesscontrole; historische smoke-tests op Dimi's account worden niet als bewijs hergebruikt. De fototellers zijn behouden.
- De nieuwe worker leest actuele prijsreferenties uit de openbare webshop-API. Hij heeft geen toegang tot de shopdatabase. Een onbereikbare of ongeldige catalogus stopt de beoordeling.
- `Radar op Sams account` publiceert alleen de radar met `RADAR_CLOUDFLARE_API_TOKEN`; `Backend live zetten` gebruikt de oorspronkelijke sleutel alleen voor de webshop. De radarsleutel verloopt op 5 februari 2027 en moet voor toekomstige publicaties tijdig worden vervangen.
- De eenmalige overdrachtsoptie controleert een verificatiemarker. Bij volgende publicaties wordt de oude database niet opnieuw gelezen. Een ontbrekende marker blokkeert publicatie; nooit een stille reset. De oude radarcron is uitgezet. De nieuwe cron wordt uitsluitend voor het hieronder vastgelegde proefvenster gebruikt.
- De oude gedeelde database blijft als archief behouden. Nieuwe radarmigraties horen bij de afzonderlijke radardatabase; pas nooit de volledige shopmigratiereeks op die database toe.
- Web Analytics is op Sams account geregistreerd en de officiële meetcode staat op de elf openbare HTML-pagina's. Het beheerscherm wordt niet gemeten. De privacytekst is via het CMS bijgewerkt.

De historische proefinstructies en technische keuzes hieronder beschrijven eerdere versies; ze betekenen geen toestemming om een nieuwe proef te starten.

### Test op Sams account (7 november 2026)

De eenmalige workflow `Radar op eigen account testen` controleerde de overgedragen database, actuele openbare shopreferenties, het gratis Apify-plan/tegoed en Telegram via alleen-lezen `getMe`/`getChat`. Er zijn nul Actor-runs gestart en nul berichten verstuurd. De foto-engine gaf via de Workers AI API op dit account bij één leeg testbeeld correct `ready / empty_image_correctly_inconclusive` terug. Dit test modeltoegang en conservatief gedrag, niet de echtheid van een kledingstuk of de kwaliteit op echte productfoto's. De aparte testreservering telt mee in het gedeelde dagelijkse AI-budget en wijzigt de oude proeftellers niet. De HTTP-status toont de uitkomst onder `readinessTest`; de normale scanner en automatische fotoanalyse blijven uitgeschakeld. Het testvenster is vast op één uur begrensd en dezelfde beeldtest wordt bij herhaling uit de database gelezen.

Rechtstreekse toegang tot Vinted gaf tijdens de controle HTTP 403. Deze versie omzeilt geen toegangsscherm en bevat geen werkende Vinted-scraper. De officiële Pro Integrations API levert voorraad-/orderbeheer, geen brede cataloguszoekfeed. De generieke radar kan een advertentiefeed met het onderstaande contract verwerken; de Apify-proef is inmiddels afzonderlijk aangesloten. Alleen een lijst zoekresultaten uit Google biedt geen betrouwbare uurlijkse dekking van nieuwe advertenties.

## Wat werkt

- Vaste Japansterdam-merken plus aangrenzende Japanse merken en aliaszoekwoorden zoals Winday, Kountry, Guilty Parties en Ganryu. De echte product-API vult de merkenlijst aan als die bereikbaar is. De JSON-reserve van de webshop wordt niet aangepast.
- Een exporteerbaar zoekplan met maximaal €40 per item, zonder maat- of categoriebeperking; zo blijven verkeerd gecategoriseerde items mogelijk vindbaar. Een alias in de titel bewijst het merk niet: de advertentiefeed moet het merk bevestigen.
- Prijsfilter en weging: flipbaarheid 35%, prijs 25%, staat 20%, fit met Japansterdam 20%.
- Alert vanaf **8,2/10**, minimaal **€50 geraamde marge**, minimaal **120% rendement op inkoopkosten**, minimaal goede staat, maximaal vijf meldingen per ronde.
- Elke melding bevat scores, reden, maat, inkoopprijs, verkoopindicatie, kostenreserves, bronlinks en directe Vinted-link. Beoordeling is op aangeleverde gegevens; de code doet geen AI-fotoanalyse of authenticiteitsgarantie.
- Alleen EUR-prijzen tot €40; geen bundels. Beschikbaarheid/prijs moet in de laatste 90 minuten gecontroleerd zijn. Ook oude, weggezakte advertenties kunnen kwalificeren zolang ze nu nog beschikbaar zijn; een leeftijdslimiet is optioneel instelbaar.
- Verkochte vergelijkingen hebben voorrang: minimaal twee recente verkochte exemplaren van hetzelfde model, met bronlinks. Daarnaast accepteert de beoordelaar een expliciet gemarkeerde schatting op basis van eigen Japansterdam-vraagprijzen. De volledige proef zoekt daarvoor hetzelfde merk, kledingtype en overeenkomstige modelkenmerken in de actuele product-API en rekent met 45–65% van de mediaan. Dit is een grove regel, geen gemeten marktwaarde; uitvoering, maat, materiaal en verkoopbaarheid kunnen sterk verschillen. Zonder passende referentie blijft de flipwaarde onbekend. Vraagprijzen worden nooit als gerealiseerde verkopen gepresenteerd.
- Conservatieve indicatie bij verkochte vergelijkingen: mediaan minus 10%. Bij een shopschatting wordt de onderkant van de genoemde bandbreedte gebruikt. Verder 15% verkoopkosten, €2 verpakking en bij ontbrekende exacte inkoopkosten €10 reserve voor verzending/koperskosten. Marge is vóór belasting en eigen tijd, geen winstgarantie. De reserves zijn aanpasbaar in `config.json`.
- Dubbele ID’s binnen een ronde worden samengevoegd. Een eerdere alert wordt alleen herhaald bij minstens 20% prijsdaling. Status wordt direct na bevestigde Telegrambezorging opgeslagen.

## Aansluiten

1. **Feed:** sluit een toegankelijke bron aan die het JSON-contract hieronder kan leveren, inclusief verkochte vergelijkingen. Er is nog geen gratis bron getest die dit compleet levert. Voor een andere bronstructuur is een adapter nodig. Een gewone Vinted-zoeklink is geen feed.
2. **Telegram:** maak een aparte bot via [@BotFather](https://t.me/BotFather) en bewaar het token als Actions-secret `TELEGRAM_BOT_TOKEN`. Open de persoonlijke Start-link met de koppelcode uit de ChatGPT-instructies. Start daarna [Telegram koppelen](https://github.com/dim-io/japansterdam/actions/workflows/telegram-connect.yml) met die code, binnen 15 minuten. De stap controleert jouw privéchat en stuurt één testbericht. De samenvatting toont vervolgens welk nummer je als `TELEGRAM_CHAT_ID` moet opslaan. De browserworkflow is ingesteld op `japansterdam_radar_bot`; pas de gebruikersnaam aan bij gebruik van een andere bot. De optionele lokale helper blijft beschikbaar als `python tools/deal-radar/telegram-setup.py`. Plak geen bottokens in de chat of in Git.
3. Open [GitHub Actions-secrets](https://github.com/dim-io/japansterdam/settings/secrets/actions). Stel `RADAR_FEED_URL`, eventueel `RADAR_FEED_TOKEN`, `TELEGRAM_BOT_TOKEN` en `TELEGRAM_CHAT_ID` in.
4. Start [Japansterdam vondstenradar](https://github.com/dim-io/japansterdam/actions/workflows/deal-radar.yml) handmatig met **dry_run** aan. Controleer de resultaten en volledigheid van de bron. Een dry-run verstuurt niets en slaat geen alertstatus op.
5. Na een geslaagde controle: stel de [Actions-variabele](https://github.com/dim-io/japansterdam/settings/variables/actions) `RADAR_ENABLED` in op `true`. Het schema controleert rond minuut 23 van ieder uur. Zet de variabele op `false` om te stoppen.

GitHub-schedules kunnen later starten of worden overgeslagen; dit is geen realtime dienst. Bij een uurinterval kan een vondst bijna een uur oud zijn voordat de controle start. Telegram wordt meteen na een succesvolle beoordeling aangeroepen. Workflowuitvoering telt mee voor de eigen GitHub Actions-limieten.

De eerste versie bewaart de alertstatus in een Actions-cache. Een verwijderde/vervallen cache kan eerdere meldingen opnieuw mogelijk maken. Ook een onderbroken Telegramverbinding ná verzending maar vóór bevestiging maakt exact-eenmaalbezorging onmogelijk. Voor harde garanties is een permanente database en aanvullende bezorgcontrole nodig. Zet nooit tokens of persoonlijke gegevens in de feed of cache.

## Feedcontract

Alle tijdstempels zijn ISO 8601 met tijdzone. Voor `condition`: `new_with_tags`, `new_without_tags`, `very_good`, `good` of `satisfactory`. `flaws` is een lijst met bekende gebreken. `authenticity: "suspect"` blokkeert een melding; ontbrekende authenticiteitscontrole wordt nooit als bewezen echtheid uitgelegd.

Onderstaand voorbeeld is fictieve testdata, geen echte advertentie of marktwaardering:

```json
{
  "version": 1,
  "items": [{
    "url": "https://www.vinted.nl/items/1234567890-testitem",
    "title": "Fictief jasje voor testdoeleinden",
    "brand": "Needles",
    "price": 30,
    "currency": "EUR",
    "size": "L",
    "available": true,
    "publishedAt": "2026-11-04T11:00:00Z",
    "observedAt": "2026-11-04T11:10:00Z",
    "condition": "very_good",
    "description": "Testdata",
    "flaws": [],
    "shippingCost": 4,
    "buyerFee": 2,
    "comparables": [
      {"url":"https://www.grailed.com/listings/111-test","price":160,"currency":"EUR","status":"sold","match":"same_model","observedAt":"2026-10-20T10:00:00Z"},
      {"url":"https://www.grailed.com/listings/222-test","price":180,"currency":"EUR","status":"sold","match":"same_model","observedAt":"2026-10-25T10:00:00Z"}
    ]
  }]
}
```

De bron wordt via HTTPS opgehaald, met optioneel `Authorization: Bearer <RADAR_FEED_TOKEN>`. Redirects worden geweigerd. Verkeerde feeddata of een onbereikbare bron laat de controle mislukken; er wordt dan geen leeg succesrapport of valse vondst verstuurd.

## Eerste Apify-proef zonder uurschema

Er is een beperkte koppeling voorbereid voor `omkar-cloud/vinted-scraper`. Deze gaf in de eerste echte proef drie geldige EUR-advertenties tot €40 met bevestigde beschikbaarheid. Dit is nog geen bewijs van volledige dekking of bruikbare verkoopwaardering voor alle merken.

1. Maak in Apify onder **API & Integrations** een apart API-token voor Japansterdam. Bewaar het als GitHub Actions-secret `APIFY_TOKEN`; deel het niet in de chat.
2. Start [Vinted proefscan](https://github.com/dim-io/japansterdam/actions/workflows/vinted-probe.yml) handmatig op `main`.
3. De proef vraagt drie Needles-advertenties tot €40 aan, op Vinted Nederland, met detailgegevens. Apify krijgt een timeout van 90 seconden en een kostenlimiet van **$0,02** mee. Een mislukte start wordt niet automatisch opnieuw geprobeerd.
4. Bekijk de samenvatting van de run. Die toont de ontvangen links, prijs, merk, staat en of beschikbaarheid expliciet bevestigd is. Ontbrekende velden blijven onbekend.

De test gebruikt het gratis Apify-tegoed als dat beschikbaar is. Hij sluit geen abonnement af. Er is nog geen bewezen dekking voor alle merken ieder uur; vergelijkingsprijzen en koppeling aan de beoordelaar zijn vervolgwerk. Deze proef activeert geen schema en verstuurt geen koopjesmeldingen. Bronnen: [scraperdocumentatie](https://apify.com/omkar-cloud/vinted-scraper), [Apify API-limieten](https://docs.apify.com/api/v2/actors-runs-post).

## Volledige eenmalige proef

`trial.mjs` gebruikt de bestaande Apify- en Telegram-secrets, haalt maximaal drie verse Needles-advertenties op en controleert de actuele Japansterdam-prijsrefer…6697 tokens truncated… behaviour before another recurring test. Source audit reads existing datasets only; it does not start scrapes.

### Replacement monitor (Top API)

The replacement acceptance control returned listings uploaded “Just now” / “a minute ago”. Exact Needles filtering returned the fashion label in newest-first order. A monitor without seeding continued through old inventory, so production **requires** `skipFirstRun: true`. Its seeded acceptance run and immediate replay both returned zero old items.

Production now uses `topapi/vinted-scraper` with a stable account-owned monitor store, exact selected brand names, verified brand IDs where available, adult men's/women's categories, per-brand price limits and price-drop alerts disabled. Groups of 2–3 searches share one capped run. The first search for each group establishes its baseline silently; subsequent searches return only items not previously recorded. The store name is independent of trial IDs; never reset it on redeploy. The existing D1 history and six-hour upload/garment/brand gates remain mandatory for bumped old items and source mistakes. Tests and real-dataset schema checks precede deployment. A successful empty baseline is expected and is not evidence of newly sourced deals. Coverage is a bounded sample, not a guarantee of finding every listing.

### Bounded 24-hour monitor follow-up

The completed source2 trial made 23 successful grouped runs: 34 unique source listings, no repeated IDs, and $0.0136 in actual Apify usage. Twelve rows exceeded the per-brand price limit; of 22 normalized rows, only three passed intake and all scored below the research threshold. There were no new research notifications or photo checks. Historical copied research is reported separately from current-trial research. These two hours do not establish whether a whole month fits the Free allowance.

The source3 follow-up runs for at most 24 hours / 288 five-minute slots, with the same 34 brands, stable source stores and historical deduplication. Each native grouped run is capped at $0.015; preflight reserves the maximum $4.32 from existing included credits and the monthly $19 ceiling remains unchanged. No plan change or credit top-up is performed. The source now receives its documented global `priceTo` as well as per-search price limits; the adapter still applies individual brand limits (40 EUR, except Needles/Kapital 70 EUR). Mixed-price groups use 70 at source, then enforce 40 for other brands. French/Spanish clothing terms are recognized without weakening freshness, brand, authenticity or visual-evidence checks. The window closes automatically.

### Private result browser and curated sources (18 November 2026)

Kenzo, Evisu and Maison Kitsuné are removed from the production selection. The remaining 31 canonical brands run in 11 groups (a 55-minute cycle at five-minute intervals). All requested favorites remain included. `Rebuild by Needles` is an additional explicit keyword query under the canonical Needles brand, not a separate brand filter. Existing per-group monitor store names and previous alert deduplication remain intact; no trial window, source cap or AI budget is extended by this configuration update.

Completed new monitor runs receive a Console status/title line with the searched brands, followed by the provider's original status message. A failed label update cannot restart or discard a successful source run. Actor access settings are never changed.

`/admin/#/radar` is a private, combined browser for existing Top API output. It reads the source directly, including results that never qualified for notifications. Cards include brand-prefixed titles, source photos, price, size, original upload time where known, observation time, category and links to Vinted and the original Apify run. The screen supports brand/text/price filters, recent/price/brand sorting, local viewed markers, deduplication by listing ID and progressive loading of all available source runs (up to 2,000). Disabled brands in historical runs are hidden by default and can be included explicitly. Loading history does not start a scraper or send Telegram messages, and displayed source snapshots are not current availability or authenticity checks.

The Radar worker's `/results` endpoint checks the existing shop session through the private `SHOP_API` service binding before every source read. Responses are private/no-store, CORS is restricted to existing storefront origins, API credentials stay server-side, and seller identifiers/descriptions are not returned. Each page reads at most 36 datasets plus authentication and run-list requests. Older runs are not relabelled and retain their original Console status; the result cards still have brand-prefixed titles.

### Expanded apparel, accessories and footwear selection (18 November 2026)

Production now selects 43 canonical brands in 15 groups: a full cycle is 75 minutes at the existing five-minute interval. The previous 11 groups retain their monitor stores. Added apparel labels: Japanese VANQUISH, *A VONTADE, HAVERSACK, JUNYA WATANABE MAN/eYe, COMME des GARÇONS HOMME, UNDERCOVER/UNDERCOVERISM, SUGAR CANE and RESOLUTE. Porter Yoshida is limited to bags/wallets; Moonstar and Shoes Like Pottery to footwear. The Japanese VANQUISH and Yoshida identities require supporting listing text and reject fitness / Porter International matches. Generic CDG is refined to HOMME only with explicit line evidence; PLAY, HOMME PLUS and HOMME DEUX are excluded.

ASICS is one canonical footwear brand with five targeted searches: Kiko Kostadinov, NOVALIS, Cecilie Bahnsen, JJJJound and HAL STUDIOS. No unrestricted ASICS brand query is added. Intake/research reject ordinary GEL-KAYANO/GEL-1130 or running shoes without selected-line evidence. Shoe and accessory recognition uses titles and, for sparse titles, the source footwear/bag category. Small sizes and women's categories remain supported. Photo triage accepts readable tongue/article labels for shoes or inner material/article labels for bags, still requiring both product and label evidence. A logo/box alone does not qualify. ASICS shop references must match the selected collaboration family as well as model features.

Line-specific queries share the existing 30-result group cap (fewer results per search when a group has more than four queries). The $0.015 per-run cap, $19 monthly ceiling, 288 maximum trial slots, price caps (€40; Kapital/Needles €70), photo budget and expired trial window are unchanged. This update does not restart scans. New monitor groups seed existing inventory on their first run before delivering subsequent new listings.

Primary references for ASICS scope: [Kiko Kostadinov GEL-KIRIL](https://www.asics.com/nl/en-nl/asics-sportstyle-kiko-kostadinov/), [ASICS NOVALIS](https://www.asics.com/gb/en-gb/mk/asicsnovalis-2023), [official limited launches](https://releases.asics.com/en-US/au), [Cecilie Bahnsen](https://www.asics.com/nl/nl-nl/asics-sportstyle-cecilie-bahnsen-gel-kayano-20/). These establish the collaboration scope, not resale values or guaranteed scarcity/profitability for every pair.

### Authorized 43-brand day trial (18 November 2026)

On Sam's explicit GO, `pilot-2026-11-18` runs from 18 November 00:33:54 UTC through 19 November 00:33:54 UTC (01:33:54 CET on both dates). Previous source3 history and persistent monitor memories are preserved. The fixed 288-slot cap at $0.015 per grouped run reserves at most $4.32 in source charges within the existing $19 monthly ceiling; per-item limits and visual-evidence requirements remain unchanged. Workers Free was checked again in the owner dashboard before activation. A new, single-call blank-image readiness test shares the existing daily three-call AI cap. Deployment must pass the full source-credit preflight and readiness check before initializing and starting the new scanner.

### Universal €70 item ceiling (18 November 2026)

At Sam's request, the default item-price ceiling is now €70 for all 43 selected brands, including Porter Yoshida accessories, Moonstar, Shoes Like Pottery and the selected ASICS collaborations. Monitor URLs, the provider's global limit, row normalization and price/research assessment use the same ceiling; €70.01 remains out of bounds. Explicit lower bounds remain available to historical/test callers. The current trial ID, start/end times, monitor stores, scan/AI counters and source-charge ceilings are preserved. The normal source monitor may seed a newly changed query without delivering historical inventory; this change does not reset the monitor or initiate an extra scrape.

### Recent result sampling and live overview (18 November 2026)

Inspection found 114 completed rounds but only seven recognized delivered listings. The actor was correctly omitting existing inventory in monitor mode; changing the price filter caused another baseline with zero delivered rows. The review page also loaded only one 36-run page and did not refresh. A successful scheduler was therefore insufficient evidence of a useful result feed.

The same trial now uses `sourceMode: recent-snapshot`: each already-reserved group samples the newest available results (maximum 20–30 rows, still $0.015 per run). `monitorMode` and `skipFirstRun` are false for this mode, with no reset of the previous monitor store. The Worker still rejects previously seen IDs across trials and advertisements older than six hours before any alert/photo processing. Thus the private overview can include useful existing listings while alerts remain a separate, deduplicated selection. Trial dates, 288-slot maximum, €70 item ceiling, $19 monthly source ceiling and AI limits are unchanged.

Verified numeric brand filters no longer also require the brand name as a keyword, so generic titles can be found. Exact keyword queries remain for unverified brand IDs and selected ASICS lines. The actor receives no automatic `brands` lookup: its logs showed that an unmatched Uniform Experiment name was expanded to a Carhartt collaboration. Source include-keywords recognize existing brand aliases, including PORTER, and the result allowance is divided over every explicit query so a final alias query is not starved.

The private overview refreshes its first page every minute while visible and active, offers a manual refresh button and initially reads up to four stored pages when recent batches contain few results. It merges by item ID, counts unique loaded run IDs, preserves filters/read markers, and stops refreshing when its view is removed. Reading/refreshing the overview never starts a scraper.

Maison Kitsuné was removed at the owner’s request. orSlow, Fullcount and Auralee were already selected and remain enabled in the source configuration. The final two groups are rebalanced to Nulabel + Portvel and Wislom + Denim by Vanquish & Fragment, preserving 11 groups and the existing caps. The changed groups will establish silent baselines under their group-specific stores; historical D1 alert deduplication remains in force. No ended scan window is extended.

### Post-trial selection refinements (19 November 2026)

A verified numeric Vinted brand filter is now retained as explicit source evidence through intake and research selection. Genuine listings with generic or mistyped titles can therefore survive the text-brand check; searches based only on a text query still require supporting brand text. Product-line restrictions, freshness, availability and authenticity gates remain in place.

The AI-score route to a Telegram standout is raised from 70 to 85/100. Explicit curator exceptions remain for the Vanquish Japan-story preference and Porter Yoshida Tanker preference. This score is still a research priority based on listing text and Japansterdam shop asking references, not a verified resale price or profit guarantee. The November 18 trial window has ended; these refinements do not restart scans, change its recorded budget, or authorize a new trial.
