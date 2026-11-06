# Japansterdam vondstenradar

**Status: Telegram en Apify zijn getest. De volledige proef heeft echte Needles-advertenties beoordeeld en een gemarkeerde proefmelding verzonden. Er staat nu een afzonderlijke, begrensde 24-uurs proef klaar voor Needles en Kapital.** Er is geen betaald abonnement afgesloten en de radar koopt nooit automatisch iets.

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

`trial.mjs` gebruikt de bestaande Apify- en Telegram-secrets, haalt maximaal drie verse Needles-advertenties op en controleert de actuele Japansterdam-prijsreferenties. Hij verstuurt maximaal één bericht met **PROEFMELDING**, ook wanneer geen kandidaat de koopjesdrempel haalt. Een afgewezen kandidaat wordt niet alsnog als goede koop aangeprezen. Ontbreken prijsreferenties, dan bevat de melding alleen de gevonden gegevens en de reden waarom er geen waardering mogelijk is.

[De volledige proef](https://github.com/dim-io/japansterdam/actions/workflows/deal-radar-trial.yml) start handmatig of bij een expliciete nieuwe `trial-request.json` op `main`. Hij start geen uurmonitor. Na bevestigde Telegrambezorging wordt het request-ID onthouden; dezelfde proef wordt bij een herhaling overgeslagen zolang de cache beschikbaar is. De Apify-kostenlimiet blijft $0,02 per uitvoering. Het standaard-uurschema is nog niet met deze Apify-proef verbonden: uitbreiding van merken, maandbudget en echte dekking worden eerst apart bepaald.

## Begrensde 24-uurs pilot op Cloudflare

De GitHub-uurplanning bleek onvoldoende betrouwbaar en is vervangen door de afzonderlijke Worker `japansterdam-radar` in `api/radar/`. De geplande functie wordt elke vijf minuten wakker; een atomaire D1-reservering staat maximaal één echte Apify-scan per UTC-uur toe. De eerste cloud-uitvoering moet worden geverifieerd via de status en opgeslagen scanresultaten. Nieuwe Cron Triggers kunnen volgens Cloudflare tot 15 minuten nodig hebben om wereldwijd actief te worden.

`pilot.json` blijft het enige vaste proefvenster; dat is niet verlengd. De worker controleert dit vóór toegang tot secrets of de bron en nogmaals vóór een betaalde aanvraag of melding. Na de eindtijd blijven cron-aanroepen inert: geen scans of notificaties. Er wordt geen abonnement of nieuw tegoed gekocht. De code bewaart de maximaal 25 bestaande scanpogingen en $0,02 providerlimiet per scan. Status/teller en Telegram-bezorgreserveringen staan nu blijvend in D1, buiten de tijdelijke Actions-cache. Een onzekere Telegram-bezorging wordt niet automatisch herhaald; er is geen exact-eenmaalgarantie bij netwerkuitval. Een prijsdaling van minstens 20% kan opnieuw een melding geven.

Kapital en Needles wisselen per echte scanpoging af. Per scan worden maximaal drie als nieuwste gesorteerde resultaten van één merk opgevraagd. Elk merk komt bij een werkend uurschema eens per twee uur aan bod. De uploaddatum is hiermee niet onafhankelijk bewezen. Een verkeerd toegewezen merk in Vinted blijft mogelijk; de beoordelaar controleert de ontvangen merknaam en signalen voor replica's. Er is geen automatische foto-authenticatie.

Alleen kandidaten die de score-, marge- en conditievoorwaarden halen worden gemeld. Shopvraagprijzen blijven **SCHATTINGEN**, geen gerealiseerde verkopen. Zonder passende referentie blijft de waarde onbekend. Uniqlo/GU-samenwerkingen worden niet vergeleken met de hoofdcollectie.

De alleen-lezen route `/status` van de radarworker toont de laatste wake-up, laatste afgeronde scan, pogingenteller, aantallen en een eventuele fout. Hij toont geen advertenties, verkopers, chat-ID of tokens en kan geen scan starten. `overdue` wordt waar als er binnen het venster meer dan 90 minuten geen geslaagde scan was; dit is een zichtbare status, geen onafhankelijke storingsmelding.

### Publicatie en overdracht

De bestaande workflow **Backend live zetten** test alle radarcode, past uitsluitend nieuwe D1-migraties toe en neemt eenmalig de bestaande `radar-pilot-`-cache over. Zonder geldige status wordt de eerste overdracht afgebroken om budget- of bezorggeschiedenis niet te resetten. Latere publicaties hergebruiken de database en zijn niet afhankelijk van cachebehoud. De bestaande drie Apify-/Telegram-secrets gaan via stdin naar Cloudflares versleutelde Worker-secrets; ze worden niet afgedrukt of in bestanden opgeslagen.

De oude GitHub-pilotworkflow kan geen scans meer starten en heeft geen cron. De generieke feedworkflow blijft apart uit via `RADAR_ENABLED`. De radar kan stoppen via `enabled:false` in `pilot.json` plus publicatie. Voor een volgende proef moet het venster bewust opnieuw worden vastgesteld; een nieuw status-ID/budget mag de bestaande limiet niet stilzwijgend resetten.

Bron: [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## Authenticiteit en bruikbaarheid van prijsreferenties

De werkjas `1069814625` was een vals-positieve melding: de ingevulde merknaam werd als identiteit gebruikt en een algemene jas werd met een bandana-archivejack vergeleken. Het item staat nu als `brand_mismatch` in het vertrouwde reviewregister van `config.json`. De scanner wijst die merkclaim af; dit zegt niet dat het kledingstuk een nagemaakt Kapital-product is.

Voor Kapital, Needles en Visvim is een voorafgaande review vereist vóór een koopjesmelding of numerieke dealscore. Een verkopersclaim, merkveld, `authenticity:verified` uit de feed of aanwezige foto-URL's telt niet als review. De status blijft `unreviewed` en wordt niet door een lage prijs gecompenseerd. Gewone koopjesmeldingen gebruiken geen automatische authenticiteitsgoedkeuring. De afzonderlijke begrensde fotovoorselectie wordt hieronder beschreven. De huidige twee proefmerken leveren dus geen nieuwe koopjesmeldingen op zolang hun items niet afzonderlijk zijn beoordeeld.

Een positieve review komt uitsluitend uit het repository-register, niet uit de scraperdata. Het register bindt de beoordeling aan item-ID, merk, titel en foto-URL's, bevat een beoordelaar en referentie en benoemt het kledingstuk, merklabel en waslabel als bekeken bewijs. Een review verloopt na zeven dagen of na een gewijzigde momentopname. De status `reviewed_supported` is een onderbouwde eerste controle, geen authenticiteitscertificaat; gewijzigde inhoud achter dezelfde foto-URL kan hiermee niet worden gedetecteerd. De fotovoorselectie hieronder helpt bij het signaleren van evidente tegenstrijdigheden; een uitgebreidere menselijke beoordelingsroute blijft vervolgwerk.

De provider normaliseert maximaal twaalf unieke HTTPS-foto-URL's van de Vinted-imagehosts, zonder fotoaanwezigheid als echtheidsbewijs te behandelen. Fotoanalyse kan later eerst op een beperkte voorselectie worden uitgevoerd. Daar is nu geen nieuwe betaalde dienst voor aangesloten.

Shopprijzen worden alleen gebruikt bij hetzelfde merk en kledingtype én overeenkomstige modelkenmerken of een overeenkomstige modelcode. Een algemene `Veste de travail`/`Work jacket` matcht niet meer met een bijzonder bandana-/patchworkmodel. Ook zo blijft een shopschatting een grove indicatie, geen verkochte vergelijkingsprijs. Dit is geen visuele modelherkenning.

Spelfout- en merkloos-zoekroutes zijn nog niet toegevoegd. Die vragen een aparte ontdekkingsroute en dezelfde of strengere bewijscontrole. Er wordt momenteel niet op maat gefilterd; fout ingevulde maten worden dus niet uitsluitend daardoor gemist. Werkelijke maten en labelfoto's moeten worden gecontroleerd voordat een maatfout als kans wordt aangemerkt.

## Lokaal

Node 22+, geen npm-afhankelijkheden:

```sh
node --test tools/deal-radar/radar.test.mjs
node tools/deal-radar/search-plan.mjs
# Configureer RADAR_FEED_URL en eventueel RADAR_FEED_TOKEN veilig in je omgeving:
RADAR_DRY_RUN=true node tools/deal-radar/radar.mjs
```

Bronnen: [Vinted-voorwaarden §6](https://www.vinted.nl/terms-and-conditions), [Vinted Pro Integrations](https://pro-docs.svc.vinted.com/), [Telegram Bot API](https://core.telegram.org/bots/api).

### Bevinding eerste volledige proef

Een zoekopdracht op alleen het woord Needles bleek ook naainaalden en irrelevante advertenties op te leveren. De beoordelaar wees die af op merk. De bronzoekopdracht is daarom aangescherpt naar de officiële Vinted-merkfilter `360271` ([catalogus](https://www.vinted.nl/catalog/582-verryttelyasut/brand/360271-needles)), zonder categorie- of maatbeperking, met €40 als bovengrens. Een geslaagde HTTP-aanroep alleen is onvoldoende: ook de relevantie van de ontvangen advertenties wordt gecontroleerd.

## Automatische fotovoorselectie (begrensde proef)

De Cloudflare-worker kan via zijn eigen Workers AI-binding een beperkte fototriage uitvoeren. Er wordt geen nieuw abonnement afgesloten. Publicatie controleert met het bestaande accounttoken of het account geen abonnementen heeft; bij ontbrekende rechten of een onbekend account is een expliciete bevestiging van de eigenaar nodig. Die is alleen geldig voor dit account en tot de bestaande proef-eindtijd. Een gedetecteerd betaald Workers-plan blijft altijd geblokkeerd. Zonder bevestiging blijft `VISION_FREE_CONFIRMED` false en wordt geen AI-aanvraag gedaan. Een lege abonnementsrespons is een conservatieve bevestiging van het gratis account. Er wordt nooit automatisch een modelovereenkomst geaccepteerd of naar een betaald plan overgeschakeld.

Maximaal drie GPU-aanvragen over het bestaande proefvenster, inclusief één blanco-beeldtest. De database reserveert vóór elke aanvraag en bewaart mislukkingen; gelijktijdige starts, herpublicatie en gelijke foto-momentopnamen geven geen extra GPU-pogingen. De gepubliceerde token-/contextlimieten van Llama 4 Scout blijven met deze drie aanvragen onder 10.000 neuronen. Op een bevestigd gratis account worden overschrijdingen van de gedeelde dagquota geweigerd; ze worden niet bijgeboekt. De bestaande Apify-limieten en stoptijd blijven gelijk.

De blanco-beeldtest moet correct melden dat er geen kledingstuk of labels zichtbaar zijn. Pas daarna wordt de triage actief. Dit test alleen de verbinding en conservatieve afhandeling van ontbrekend beeld, niet de kwaliteit van kledingauthenticatie. Mislukte toegang, quota, modelvoorwaarden of ongeldige output blijven zichtbaar in `/status` en leveren geen authenticiteitsgoedkeuring op.

Alleen een financieel interessante voorselectie met passende modelreferenties en zonder eerdere afwijzing gaat door. Er worden maximaal vier foto’s gebruikt. Per foto: uitsluitend de vaste HTTPS Vinted-imagehosts, geen redirects, maximaal 256 KiB en een ondersteund rasterformaat. Ontbrekend/onleesbaar of te groot beeld blijft onzeker. Fototeksten zijn onbetrouwbare broninhoud; het model krijgt geen tools, geheimen, kooprechten of vrijheid om links op te vragen.

Uitkomsten: `rejected`, `inconclusive` of `visually_consistent`. De laatste status is uitsluitend een visuele eerste controle: het kledingstuk en leesbare merk-/waslabels lijken samenhangend. AI-resultaten worden nooit in het vertrouwde handmatige reviewregister geschreven. Een kandidaat kan hooguit één aparte **FOTOCHECK — MENSELIJKE BEOORDELING NODIG**-melding krijgen, zonder dealscore of bevestigde flipwaarde. Een gewone koopjesmelding blijft een voorafgaande expliciete review vereisen.

Bronnen: [model](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/), [gratis quotum en prijzen](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## Vervolg: verkopers en bundels (nog niet actief)

Sam wil na een echt sterke vondst ook interessante andere items van dezelfde verkoper kunnen vinden. Bouw dit pas na een geslaagde itembeoordeling: één begrensde kastcontrole, op een bevestigde verkoper-ID, met aparte beoordeling per extra item. Merken, authenticiteit, staat en prijsgrens blijven gelden. Bereken bundelkosten met werkelijk bevestigde verzend-/koperskosten en een echte bundelprijs; veronderstel geen korting of transportbesparing. Toon één overzicht van hoofditem en geschikte aanvullingen. Neem geen contact op met verkopers en koop niets automatisch. De huidige zoekbron levert nog geen volledige kledingkast; daarvoor zijn een aparte adapter en een apart begrensd bronbudget nodig. Deze uitbreiding staat uitsluitend op de vervolglijst.


## Tweede proef — 6 november 2026

Op uitdrukkelijk verzoek start een afzonderlijke 24-uursproef van 5 november 22:55 UTC tot 6 november 22:55 UTC. Instellingen staan in `pilot-v2.json`; de oorspronkelijke proef blijft ongewijzigd en verlopen. Elk van maximaal 24 uurblokken zoekt Kapital én Needles, maximaal 10 resultaten per merk, €40 per stuk, nieuwste eerst. Dit zijn maximaal 48 scraperstarts / 480 resultaten, met een harde Apify-runlimiet van $0,03 (maximaal $1,44 aan scraperbudget, plus $0,25 vrije reserve). Vooraf is via de Apify-API uitsluitend ja/nee bevestigd dat het account Free is en voldoende ongebruikt tegoed heeft; accountgegevens en saldo zijn niet gepubliceerd. Iedere ronde controleert plan en vrije ruimte opnieuw; een onbekend plan of te weinig ruimte stopt scans. Er wordt geen abonnement of accountlimiet aangepast.

Migratie 0005 houdt nieuwe tellers apart, neemt deduplicatie over en bewaart de eerste proef. Fotoanalyse blijft triage en geeft nooit authenticiteitsgoedkeuring. Maximaal vier pogingen in de tweede proef én drie per UTC-dag over beide proeven samen; de eerdere twee pogingen tellen mee. De oorspronkelijke geslaagde beeldtest blijft geldig; geen onnodige extra blanke test. Bij een daglimiet wordt een kandidaat niet permanent als geanalyseerd gemarkeerd.

De eerste ronde vergelijkt de resultaten met één rechtstreeks opgehaalde openbare Vinted-catalogus per merk. Een blokkade, onleesbare pagina of verschil wordt expliciet opgeslagen als niet geverifieerd of afwijkend, nooit als geslaagde versheidscontrole. `consistent_snapshot` betekent uitsluitend dat de eerste drie gevonden kaartlinks overeenkomen, geen garantie op volledigheid. De status toont aantallen per merk en deze uitkomst, zonder advertenties of verkopers te publiceren. Een sterk afwijkende bron moet handmatig worden onderzocht voordat kwaliteit wordt geclaimd. De cron herstart of verlengt de proef niet na de eindtijd.

## Onderzoeksroute zonder modelreferentie

`pilot-v2.json.researchEnabled` activeert een aparte wachtrij (`radar_research`, migratie 0006). Een ontbrekende modelreferentie is geen bewijs dat een stuk oninteressant is. Alleen beschikbare, recent gecontroleerde items binnen €40 met een herkend kledingtype, goede gerapporteerde staat, meerdere foto's en een expliciete merkvermelding in titel/beschrijving kunnen deze route in. Replica's, afgewezen merkclaims, kinderkleding, bekende Uniqlo/Gu-samenwerkingen en overige eerdere afwijsgronden blijven uitgesloten. De merkvermelding is een selectiesignaal, geen echtheidsbewijs.

Fotoanalyse gebruikt dezelfde vier proefpogingen en dezelfde globale daglimiet van drie. De selectie gebruikt de cover plus de laatste drie foto's als er meer dan vier zijn, omdat labeldetails vaak achteraan staan. Sterke reeds geprijsde kandidaten houden voorrang op dit gedeelde budget. Kandidaten blijven intern bewaard als het budget of bruikbaar beeld ontbreekt. Een tegenstrijdig beeldresultaat wordt afgewezen. De statusendpoint toont uitsluitend aantallen per wachtrijstatus, geen advertentiegegevens.

Er zijn maximaal twee aparte **ONDERZOEK — GEEN KOOPADVIES**-meldingspogingen voor de hele huidige proef. Na een geslaagde fototriage of een daadwerkelijk beoordeeld maar onvoldoende leesbaar label kan zo'n melding vragen om handmatig model, labels, staat en vergelijkbare verkopen te onderzoeken. De melding geeft geen dealscore, verkoopwaarde of marge. Deze route kan nooit een gewone koopjesmelding of vertrouwde authenticiteitsgoedkeuring opleveren. Eerdere fotocheckmeldingen delen dezelfde deduplicatiesleutel. Onzekere Telegram-bezorging wordt niet automatisch herhaald. Publicatie reset geen scan-, AI- of meldingsbudget en verlengt de proef niet.


### Begrensde verwerking op Workers Free

Het bijhouden van twintig geziene items gebeurt met één leesquery en één bulk-upsert (maximaal 80 parameters, onder de D1-limiet van 100). Apify-aanvragen wachten aan de serverkant maximaal twintig seconden; per gestarte run volgen maximaal drie statuscontroles en eventueel één abort. Een onzekere run wordt nooit opnieuw gestart. Dit voorkomt onbeperkt pollverkeer en houdt de uitvoering binnen de limieten van Workers Free.

Per ronde worden maximaal vijf ongeprijsde onderzoekskandidaten vastgelegd, maximaal één kandidaat aan fotoanalyse aangeboden en maximaal twee Telegram-notificaties totaal verstuurd. Eerder afgeronde onderzoeken worden overgeslagen, zodat volgende kandidaten in latere rondes aan bod kunnen komen. De bestaande totale AI- en bronbudgetten, maximaal twee onderzoeksnotificaties per proef, authenticiteitsregels en eindtijd blijven gelden. Een test telt database-, foto-, AI- en meldingsverzoeken voor een volle ronde van twintig items mee en reserveert ook ruimte voor beide bronaanvragen en hun begrensde statuscontroles.

### Eenmalige controle met opgeslagen resultaten

Op verzoek van de eigenaar wordt de nieuwe onderzoeksroute één keer op recente, bestaande Apify-resultaten gecontroleerd (`researchTestOnce`). De cron reserveert deze controle apart in `radar_research_tests` (migratie 0007), leest uitsluitend reeds voltooide runs en datasets, en onderzoekt hoogstens één geselecteerde kandidaat. Er worden geen Actors gestart of herstart. De originele controletijd van de advertentie blijft behouden; resultaten ouder dan 90 minuten worden niet gebruikt.

De test gebruikt dezelfde foto- en meldingsbudgetten, deduplicatie, gratis-accountbevestiging en eindtijd. Scanpogingen, uurreservering en `last_scan_at` worden niet aangepast: een controle op opgeslagen data wordt niet als verse scrape gepresenteerd. Herpublicaties of gelijktijdige cron-events herhalen de test niet. De publieke status toont alleen de geaggregeerde uitkomst onder `researchTest`; een onzekere fout blijft als mislukt/pending zichtbaar en wordt niet automatisch opnieuw geprobeerd.
