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

Erwartet wird JSON mit `"ok":true`. Der Test fragt bewusst nur das aktuelle Datum ab, da der Free-Tarif `season=2026` blockiert. Wichtig sind:

- `fixtureResults`
- `worldCupResults`
- `fixtureErrors`

Der Test verbraucht hoechstens drei API-Abfragen. Der Schluessel wird weder an den Browser noch an GitHub ausgeliefert.

## Kader und Ereignisse testen

Mit den IDs aus dem ersten Test:

`https://tippradar26.vercel.app/api/football?action=fixture-check&fixture=1489369&homeTeam=16&awayTeam=1531&token=DEIN-PRUEFWORT`

Dieser Test verbraucht drei weitere Abfragen. Vor dem Anpfiff darf `eventResults` noch `0` sein. Entscheidend ist, ob `homeSquad` und `awaySquad` Spieler enthalten und keine Plan-Fehler gemeldet werden.
