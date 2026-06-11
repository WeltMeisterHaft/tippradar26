# Family-Konten und Meine Top 5

## Kontoarten

- **Single:** Eine E-Mail und ein Tipp-Profil.
- **Family:** Eine E-Mail fuer das Hauptprofil und zusaetzliche Kinderprofile.
- Bestehende Konten koennen im Kontofenster von **Single** auf **Family** umgestellt werden.
- Im Kontofenster wird vor dem Tippen ueber **Wer tippt gerade?** das aktive Profil gewaehlt.
- Jedes Profil besitzt eigene Tipps, Punkte und eine eigene Top-5-Auswahl.
- Kinder benoetigen keine E-Mail-Adresse.

Der Organisator ordnet Haupt- und Kinderprofile wie bisher ueber den identischen Anzeigenamen einem Wertungsteam zu.

## Meine Top 5

- Pro Profil koennen bis zu fuenf reale Spieler ausgewaehlt werden.
- Ein Punkt je erzieltem Tor.
- Ein Punkt je ausgewaehltem Spieler, dessen Nationalmannschaft das Spiel gewinnt.
- Die Auswahl wird mit dem ersten Turnierspiel geschlossen.
- Eigentore und Elfmeterschiessen werden nicht erfasst. Regulare Elfmetertore koennen als Tor eingetragen werden.

Die Kader und Torschuetzen kommen automatisch von API-Football. OpenLigaDB bleibt die Quelle fuer Spielplan und Endergebnisse. Die manuelle Torschuetzen-Eingabe unter **Teams & Regeln** dient nur als Notfallkorrektur.

## Supabase

Die beiden SQL-Dateien im Supabase-Paket in dieser Reihenfolge ausfuehren:

1. `01-migration-bot-strategies.sql`
2. `02-migration-family-top5.sql`

Beide Migrationen sind fuer eine bereits laufende TippRadar-Datenbank vorgesehen.
