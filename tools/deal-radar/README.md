# Japansterdam vondstenradar

**Status: Telegram-test geslaagd en een Apify-proef leverde drie beschikbare advertenties tot €40 op. De volledige proef koppelt nu ophalen, een voorzichtige beoordeling en één Telegrammelding. Het uurschema staat uit.** Er is geen betaald abonnement afgesloten en de radar koopt nooit automatisch iets.

Rechtstreekse toegang tot Vinted gaf tijdens de controle HTTP 403. Deze versie omzeilt geen toegangsscherm en bevat geen werkende Vinted-scraper. De officiële Pro Integrations API levert voorraad-/orderbeheer, geen brede cataloguszoekfeed. De generieke radar kan een advertentiefeed met het onderstaande contract verwerken; de Apify-proef is inmiddels afzonderlijk aangesloten. Alleen een lijst zoekresultaten uit Google biedt geen betrouwbare uurlijkse dekking van nieuwe advertenties.

## Wat werkt

- Vaste Japansterdam-merken plus aangrenzende Japanse merken en aliaszoekwoorden zoals Winday, Kountry, Guilty Parties en Ganryu. De echte product-API vult de merkenlijst aan als die bereikbaar is. De JSON-reserve van de webshop wordt niet aangepast.
- Een exporteerbaar zoekplan met maximaal €40 per item, zonder maat- of categoriebeperking; zo blijven verkeerd gecategoriseerde items mogelijk vindbaar. Een alias in de titel bewijst het merk niet: de advertentiefeed moet het merk bevestigen.
- Prijsfilter en weging: flipbaarheid 35%, prijs 25%, staat 20%, fit met Japansterdam 20%.
- Alert vanaf **8,2/10**, minimaal **€50 geraamde marge**, minimaal **120% rendement op inkoopkosten**, minimaal goede staat, maximaal vijf meldingen per ronde.
- Elke melding bevat scores, reden, maat, inkoopprijs, verkoopindicatie, kostenreserves, bronlinks en directe Vinted-link. Beoordeling is op aangeleverde gegevens; de code doet geen AI-fotoanalyse of authenticiteitsgarantie.
- Alleen EUR-prijzen tot €40; geen bundels. Beschikbaarheid/prijs moet in de laatste 90 minuten gecontroleerd zijn. Ook oude, weggezakte advertenties kunnen kwalificeren zolang ze nu nog beschikbaar zijn; een leeftijdslimiet is optioneel instelbaar.
- Verkochte vergelijkingen hebben voorrang: minimaal twee recente verkochte exemplaren van hetzelfde model, met bronlinks. Daarnaast accepteert de beoordelaar een expliciet gemarkeerde schatting op basis van eigen Japansterdam-vraagprijzen. De volledige proef zoekt daarvoor hetzelfde merk én kledingtype in de actuele product-API en rekent met 45–65% van de mediaan. Dit is een grove regel, geen gemeten marktwaarde; uitvoering, maat, materiaal en verkoopbaarheid kunnen sterk verschillen. Zonder passende referentie blijft de flipwaarde onbekend. Vraagprijzen worden nooit als gerealiseerde verkopen gepresenteerd.
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

`trial.mjs` gebruikt de bestaande Apify- en Telegram-secrets, haalt maximaal drie verse Needles-advertenties op en controleert de actuele Japansterdam-prijsreferenties. Hij verstuurt maximaal één bericht met **PROEFMELDING**, ook wanneer geen kandidaat de koopjesdrempel haalt. Een afgewezen kandidaat wordt niet alsnog als goede koop aangeprezen. Ontbreken prijsreferenties, dan bevat de melding alleen de gevonden gegevens en de reden waarom er geen waardering mogelijk is.

[De volledige proef](https://github.com/dim-io/japansterdam/actions/workflows/deal-radar-trial.yml) start handmatig of bij een expliciete nieuwe `trial-request.json` op `main`. Hij start geen uurmonitor. Na bevestigde Telegrambezorging wordt het request-ID onthouden; dezelfde proef wordt bij een herhaling overgeslagen zolang de cache beschikbaar is. De Apify-kostenlimiet blijft $0,02 per uitvoering. Het standaard-uurschema is nog niet met deze Apify-proef verbonden: uitbreiding van merken, maandbudget en echte dekking worden eerst apart bepaald.

## Lokaal

Node 22+, geen npm-afhankelijkheden:

```sh
node --test tools/deal-radar/radar.test.mjs
node tools/deal-radar/search-plan.mjs
# Configureer RADAR_FEED_URL en eventueel RADAR_FEED_TOKEN veilig in je omgeving:
RADAR_DRY_RUN=true node tools/deal-radar/radar.mjs
```

Bronnen: [Vinted-voorwaarden §6](https://www.vinted.nl/terms-and-conditions), [Vinted Pro Integrations](https://pro-docs.svc.vinted.com/), [Telegram Bot API](https://core.telegram.org/bots/api).
