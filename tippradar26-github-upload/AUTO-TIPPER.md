# Automatische Tipp-Spieler

TippRadar 26 bietet drei kostenlose Strategien ohne Wettquoten:

- **DOG-TIP:** Waehlt fuer jedes Spiel reproduzierbar ein Ergebnis aus einer Liste typischer Fussballresultate. Derselbe Spieler tippt dasselbe Spiel immer gleich.
- **RANK-TIP:** Vergleicht einen eingefrorenen, FIFA-orientierten Ranglisten-Snapshot vom 19. November 2025. Je groesser der Rangunterschied, desto deutlicher der Tipp.
- **STAT-TIP:** Nutzt denselben Ranglisten-Snapshot, leitet daraus erwartete Tore ab und waehlt mit einer Poisson-Verteilung das wahrscheinlichste Ergebnis.

Die Modelle verwenden keine Live-Daten und keine Wettquoten. Sie sollen als transparente, kostenlose Mitspieler dienen und keine belastbare Prognose versprechen.

Alte automatische Spieler mit der Strategie `COOPER Classic` werden in der App automatisch als `STAT-TIP` behandelt.
