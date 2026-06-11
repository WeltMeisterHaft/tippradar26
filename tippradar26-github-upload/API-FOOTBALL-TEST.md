# API-Football sicher testen

Der API-Schluessel gehoert ausschliesslich als geschuetzte Umgebungsvariable in Vercel.

## Vercel

1. Projekt `tippradar26` oeffnen.
2. `Settings` und danach `Environment Variables` waehlen.
3. Name: `API_FOOTBALL_KEY`
4. Value: der API-Football-Schluessel.
5. Fuer `Production`, `Preview` und `Development` aktivieren.
6. Eine zweite Variable anlegen:
   - Name: `API_FOOTBALL_SYNC_TOKEN`
   - Value: ein selbst gewaehltes langes Pruefwort ohne Leerzeichen.
7. Speichern und danach neu deployen.

## Test

Nach dem Deployment diese Adresse oeffnen:

`https://tippradar26.vercel.app/api/football?action=probe&token=DEIN-PRUEFWORT`

Erwartet wird JSON mit `"ok":true`. Wichtig sind:

- `leagueResults`
- `fixtureResults`
- `leagueErrors`
- `fixtureErrors`

Der Test verbraucht hoechstens drei API-Abfragen. Der Schluessel wird weder an den Browser noch an GitHub ausgeliefert.
