# TippRadar 26 fuer Einladungen vorbereiten

## 1. Supabase aktualisieren

Im SQL Editor nacheinander vollstaendig ausfuehren:

1. `01-migration-bot-strategies.sql`
2. `02-migration-family-top5.sql`
3. `03-migration-family-roles.sql`

`Success. No rows returned` ist jeweils die erwartete Rueckmeldung.

## 2. Web-App aktualisieren

Den Inhalt des Web-Pakets in das GitHub-Repository hochladen. Der Ordner `api` muss als Ordner erhalten bleiben. Vercel erstellt danach automatisch ein neues Deployment.

Die Vercel-Variablen `API_FOOTBALL_KEY` und `API_FOOTBALL_SYNC_TOKEN` bleiben unveraendert bestehen.

## 3. Kurztest

1. Als Organisator anmelden.
2. Im Kontofenster pruefen, ob das Hauptprofil angezeigt wird.
3. Testweise `Single` auf `Family` umstellen und ein Kinder- oder Erwachsenenprofil anlegen.
4. Zwischen den Profilen wechseln und je einen Tipp speichern.
5. Unter `Meine Top 5` eine Mannschaft waehlen. Der echte Kader muss erscheinen.
6. Wieder auf `Single` zurueckstellen, falls das Organisator-Konto kein Familienkonto sein soll.

## 4. Erwachsene einladen

Den Erwachsenen schicken:

- Adresse: `https://tippradar26.vercel.app`
- Einladungscode aus dem Kontofenster
- Hinweis: Mit E-Mail anmelden, Anzeigenamen eintragen und `Single` oder `Family` waehlen.

Bei `Family` kann die eingeladene Person anschliessend Kinderprofile ohne weitere E-Mail-Adresse anlegen.

Wichtig: Der Anzeigename jedes Profils muss dem Namen entsprechen, den der Organisator unter `Teams & Spieler` angelegt hat.
Teamname, Teamfarbe und die Rolle `Team-Lead`, `Erwachsen` oder `Kind` werden in Tippvergleich und Rangliste angezeigt.
