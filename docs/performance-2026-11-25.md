# Japansterdam — snelheidstests en optimalisaties

Afgerond: 25 november 2026. Alle wijzigingen staan live op https://japansterdam.com/.

## Methode

Vijf openbare pagina’s zijn met Lighthouse 13.6.0 gemeten: home, shop, de NULABEL-productpagina, het Journal-overzicht en het NULABEL-artikel. Twee profielen: Lighthouse standaard mobiel met gesimuleerde vertraging, en de desktoppreset. Iedere audit start met een nieuwe browser en lege paginacache. De nulmeting dateert van 24 november, de eindmeting van 25 november; het betreft de live catalogus, geen bevroren kopie. Netwerkomstandigheden en testmachines kunnen verschillen.

Er waren 10 nulmetingen, 10 tussentijdse metingen en 18 eindmetingen. Home en artikel zijn in de eindmeting per profiel driemaal gemeten vanwege wisselende resultaten. Hieronder staan hun medianen; de andere pagina’s hebben één meting per profiel. Dit zijn labmetingen, geen CrUX-velddata en geen garantie voor ieder apparaat of bezoek.

## Lighthouse Performance, schaal 0–100

|Pagina|Mobiel vóór → na|Desktop vóór → na|
|---|---:|---:|
|Home*|95 → 99|99 → 99|
|Shop|96 → 99|100 → 99|
|Productpagina (NULABEL)|93 → 95|100 → 98|
|Journal-overzicht|89 → 99|92 → 100|
|NULABEL-artikel*|100 → 98|99 → 99|

\* Mediaan van drie eindmetingen. Alle individuele runs zijn bewaard in het [resultatenbestand](performance-2026-11-25-results.json).

### Spreiding die niet mag verdwijnen achter een gemiddelde

- Mobiele home: **78, 99, 99**. De eerste run had **915,5 ms Total Blocking Time**; de volgende twee hadden 0 ms. Er is dus één duidelijke CPU/blokkeringsuitschieter. De oorzaak van die afzonderlijke uitschieter is met deze metingen niet vastgesteld.
- Desktop home: 99, 99, 100.
- Mobiel artikel: 99, 97, 98; desktop artikel: 100, 99, 99.
- De kleine dalingen op desktop shop/product en het artikel zijn zichtbaar in de tabel. Niet iedere score of timing is verbeterd, ondanks minder overgedragen bytes en minder verzoeken.

## Mobiel: dataverkeer, grootste zichtbare inhoud en verzoeken

Totale overgedragen data tijdens de audit; LCP is de tijd tot het grootste zichtbare inhoudselement wordt weergegeven. De mediaan wordt per maatstaf berekend voor de herhaalde pagina’s.

|Pagina|Data vóór|Data na|Verschil|LCP vóór → na|Verzoeken vóór → na|
|---|---:|---:|---:|---:|---:|
|Home|0.89 MB|0.57 MB|35% minder|2.49 → 1.99 s|42 → 26|
|Shop|1.17 MB|1.10 MB|6% minder|2.72 → 2.19 s|51 → 38|
|Productpagina (NULABEL)|0.91 MB|0.70 MB|23% minder|3.05 → 2.93 s|44 → 31|
|Journal-overzicht|2.04 MB|0.32 MB|84% minder|3.74 → 2.00 s|39 → 26|
|NULABEL-artikel|0.71 MB|0.36 MB|49% minder|1.33 → 2.14 s|35 → 23|

Het Journal-overzicht daalt van circa 2,04 MB naar 0,32 MB. Het artikel daalt van circa 0,71 MB naar 0,36 MB nadat ook dubbele afbeeldingsdownloads zijn verholpen. De productpagina houdt met circa 2,93 s mobiel LCP nog ruimte voor verbetering. Het artikel toont in deze eindmetingen een hogere LCP dan de nulmeting; de eerste inhoud verschijnt wel eerder, en de totale hoeveelheid data is ongeveer gehalveerd. Een lagere hoeveelheid data bewijst op zichzelf geen snellere LCP.

## Uitgevoerde wijzigingen

1. **Paginagegevens verkleind.** Alleen het geopende artikel krijgt zijn volledige tekst mee; andere artikelen houden de metadata en correcte leestijd. Alleen het geopende product krijgt alle beschrijving, measurements en foto’s mee. Productkaarten en filters behouden de benodigde velden. Een vergelijking met dezelfde catalogus bracht de gzip-gecomprimeerde JSON voor home/shop van 88.250 naar 15.767 bytes, circa 82% kleiner.
2. **JavaScript en CSS gebundeld en verkleind.** Lokale versie-imports delen één module. De bouwstap maakt bestanden met een inhoudshash en laadt gedeelde modules vroeg. Die bestanden mogen langdurig worden gecachet; bij een wijziging verandert de bestandsnaam.
3. **Redactionele foto’s passend geleverd.** Ook publieke externe Journal-foto’s krijgen WebP-varianten van 320, 480, 768 en 960 pixels. De build verwerkte 426 van 426 afbeeldingen succesvol. Een eerder circa 819 KB grote cover weegt op 480 pixels circa 31 KB. Bronnen en beeldinhoud blijven behouden.
4. **Eerste Journal-covers krijgen laadprioriteit.** Andere covers blijven uitgesteld laden.
5. **Dubbele artikelfoto-downloads opgelost.** Server en browser gebruiken exact dezelfde vier kandidaten en dezelfde maatvoering; de browser wisselt daardoor niet tijdens het opbouwen van de pagina van 768 naar 960 pixels.
6. **Kleine merkbeelden verkleind.** De footer en de geborduurde kruizen in de merkenstrook gebruiken passende beeldvarianten.
7. **Homepagewerk verdeeld.** De browser kan tussen de opbouw van secties tekenen en op invoer reageren.

De oorspronkelijke productfoto’s blijven beschikbaar voor vergroting. Nieuwe of nog niet verwerkte afbeeldingen vallen terug op het origineel. Prijzen en beschikbaarheid blijven per paginabezoek vers opgehaald; HTML en checkout blijven ongecachet. CMS-teksten, productprijzen en measurements zijn niet aangepast.

## Verificatie

- 38 technische tests geslaagd, inclusief bestaande checkout-controles en nieuwe tests voor de beperkte paginadata, veilige afbeeldingsfallbacks en het bundelen.
- Volledige lokale build geslaagd; publicatie en automatische controles geslaagd.
- Live browsercontrole: homepage, filters voor categorie en schoenmaat, aflopende prijssortering, menu, tas openen/sluiten, fotovergroting met het origineel, Journal-leestijden en gelijke afbeeldingskandidaten. Geen JavaScript-fouten gezien. Tijdelijke viewportinstellingen zijn teruggezet. Er zijn geen bestellingen geplaatst en geen tasitems veranderd.
- De snelheidsprofielen zijn desktop en gesimuleerd mobiel; het is geen meting op een fysieke telefoon.

## Bewijs en herhalen

- [Nulmeting — GitHub Actions](https://github.com/dim-io/japansterdam/actions/runs/45503712128)
- [Tussentijdse meting](https://github.com/dim-io/japansterdam/actions/runs/45665344270)
- [Eindmeting en afzonderlijke rapporten](https://github.com/dim-io/japansterdam/actions/runs/45666579554)
- [Optimalisaties](https://github.com/dim-io/japansterdam/commit/01d6fcb43db309dbbaa35690fb59c492da767fa8)
- [Correctie van dubbele downloads en verdeling van homepagewerk](https://github.com/dim-io/japansterdam/commit/92783c9520d175fc33f28f6b0c5ab80ab69abab1)

De volledige Lighthouse-rapporten zijn als workflow-artifact 14 dagen beschikbaar. Het compacte resultatenbestand en dit verslag blijven in de repository bewaard. De workflow **Storefront desktop and mobile speed audit** kan handmatig opnieuw worden gestart; er is geen periodiek schema toegevoegd.
