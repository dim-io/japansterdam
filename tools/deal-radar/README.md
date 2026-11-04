# Japansterdam vondstenradar

**Status: beoordelaar en Telegramkoppeling gebouwd; nog geen werkende Vinted-feed aangesloten. Het uurschema staat daarom uit.** Er is geen betaald abonnement afgesloten en de radar koopt nooit automatisch iets.

Rechtstreekse toegang tot Vinted gaf tijdens de controle HTTP 403. Deze versie omzeilt geen toegangsscherm en bevat geen werkende Vinted-scraper. De officiële Pro Integrations API levert voorraad-/orderbeheer, geen brede cataloguszoekfeed. Een toegankelijke advertentiefeed met de onderstaande gegevens is nodig vóór activering. Alleen een lijst zoekresultaten uit Google biedt geen betrouwbare uurlijkse dekking van nieuwe advertenties.

## Wat werkt

- Vaste Japansterdam-merken plus aangrenzende Japanse merken en aliaszoekwoorden zoals Winday, Kountry, Guilty Parties en Ganryu. De echte product-API vult de merkenlijst aan als die bereikbaar is. De JSON-reserve van de webshop wordt niet aangepast.
- Een exporteerbaar zoekplan met maximaal €40 per item, zonder maat- of categoriebeperking; zo blijven verkeerd gecategoriseerde items mogelijk vindbaar. Een alias in de titel bewijst het merk niet: de advertentiefeed moet het merk bevestigen.
- Prijsfilter en weging: flipbaarheid 35%, prijs 25%, staat 20%, fit met Japansterdam 20%.
- Alert vanaf **8,2/10**, minimaal **€50 geraamde marge**, minimaal **120% rendement op inkoopkosten**, minimaal goede staat, maximaal vijf meldingen per ronde.
- Elke melding bevat scores, reden, maat, inkoopprijs, verkoopindicatie, kostenreserves, bronlinks en directe Vinted-link. Beoordeling is op aangeleverde gegevens; de code doet geen AI-fotoanalyse of authenticiteitsgarantie.
- Alleen EUR-prijzen tot €40; geen bundels. Beschikbaarheid/prijs moet in de laatste 90 minuten gecontroleerd zijn. Ook oude, weggezakte advertenties kunnen kwalificeren zolang ze nu nog beschikbaar zijn; een leeftijdslimiet is optioneel instelbaar.
- Geen verzonnen verkoopwaardes: minimaal twee recente daadwerkelijk verkochte exemplaren van hetzelfde model, met bronlinks. Vraagprijzen tellen niet als gerealiseerde verkopen. De feed moet die vergelijkingen aanleveren; zonder die informatie wordt een item als onvoldoende onderbouwd overgeslagen, niet als bewezen slechte deal beschouwd.
- Conservatieve indicatie: mediaan van de vergelijkingen minus 10%. Verder 15% verkoopkosten, €2 verpakking en bij ontbrekende exacte inkoopkosten €10 reserve voor verzending/koperskosten. Marge is vóór belasting en eigen tijd, geen winstgarantie. De reserves zijn aanpasbaar in `config.json`.
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

## Lokaal

Node 22+, geen npm-afhankelijkheden:

```sh
node --test tools/deal-radar/radar.test.mjs
node tools/deal-radar/search-plan.mjs
# Configureer RADAR_FEED_URL en eventueel RADAR_FEED_TOKEN veilig in je omgeving:
RADAR_DRY_RUN=true node tools/deal-radar/radar.mjs
```

Bronnen: [Vinted-voorwaarden §6](https://www.vinted.nl/terms-and-conditions), [Vinted Pro Integrations](https://pro-docs.svc.vinted.com/), [Telegram Bot API](https://core.telegram.org/bots/api).
