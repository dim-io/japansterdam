# Werkafspraken voor AI-assistenten (Claude, Codex en andere)

Dimitri en Sam werken allebei in dit project, elk met een eigen assistent. Zodat niemand op een verouderde versie werkt of werk van de ander overschrijft, gelden deze regels **altijd**, ook als de gebruiker er niet om vraagt:

1. **Begin elke sessie met `git pull --rebase`.** Doe dat vóór je iets leest of aanpast.
2. **Push na elke afgeronde wijziging.** Commit met een korte, duidelijke boodschap en doe meteen `git push`. Laat nooit werk achter dat niet gecommit of niet gepusht is. Vraag hier geen toestemming voor: pushen is in dit project de standaard.
3. **Wordt de push geweigerd** omdat de ander ondertussen iets heeft gepusht: doe `git pull --rebase` en push opnieuw. Ontstaat er een conflict, los het dan zelf op als het duidelijk is. Twijfel je, leg het dan aan de gebruiker voor. Gebruik nooit `git push --force`.
4. **Werk rechtstreeks op `main`.** Geen aparte branches, tenzij de gebruiker daarom vraagt.
5. **Sluit af met een controle**: `git status` moet schoon zijn en `git log origin/main -1` moet jouw laatste commit tonen.

## Goed om te weten

- De site staat op GitHub Pages (https://dim-io.github.io/japansterdam/). Elke push naar `main` staat binnen een minuut live.
- **Producten en paginateksten komen uit het beheerscherm** (`/admin/`), niet uit `data/products.json` en `data/content.json`. Die twee bestanden zijn alleen een reserve als de backend niet bereikbaar is. Wil je producten of teksten aanpassen, doe dat dan via het beheerscherm.
- De backend (map `api/`) draait op Cloudflare. **Je hoeft niet zelf te deployen**: bij elke push die iets in `api/` verandert, zet GitHub Actions de backend automatisch live (`.github/workflows/deploy-api.yml`). Nieuwe databasemigraties in `api/migrations/` (genummerd, bijvoorbeeld `0002_...sql`) worden daarbij eerst uitgevoerd. Controleer na zo'n push met `gh run list --workflow deploy-api.yml -L 1` of het gelukt is.
- Wijzig nooit een migratie die al bestaat; maak altijd een nieuwe.
- Zet nooit wachtwoorden, tokens of `.dev.vars` in de repo.
