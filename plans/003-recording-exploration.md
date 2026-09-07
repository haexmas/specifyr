# Plan 003: Aufzeichnungen untersuchen und vergleichen (Stufe 5b)

- Status: DRAFT — Produkt- und Umsetzungsvorschlag für Stufe 5b.
- Priorität: P2; Aufwand: L; Risiko: MED (Rekonstruktion aus Deltas/Checkpoints
  benötigt disziplinierte State-Aufzeichnung aus 5a).
- Voraussetzung: [Plan 002](002-live-observation-execution-tracing.md) ist
  abgenommen und das Gate 5a → 5b ist bestanden.
- Basis: [Plan 001](001-editor-perspectives-and-state-comparison.md) für
  gemeinsames Modell, Projektionen und IST-Extraktion.

## Ziel und Erfolgskriterium

Aufgezeichnete Durchläufe lassen sich schrittweise untersuchen: Zeitleiste,
vor/zurück, rekonstruierter erfasster Zustand an ausgewählten Beobachtungs-
punkten, Stopps bei erklärbaren Auffälligkeiten und Vergleich zweier
Durchläufe. Rückwärtsnavigation betrifft ausschließlich die Aufzeichnung;
keine HTTP-/DB-Nebenwirkung wird zurückgedreht oder erneut ausgeführt.

Erster sichtbarer Erfolg: eine aufgezeichnete Artefakt-Auswahl deterministisch
replayen, an einem Beobachtungspunkt anhalten, den rekonstruierten Zustand
inspizieren und zwei Durchläufe mit einem kontrollierten Unterschied
gegenüberstellen, ohne dass Timing- oder Reihenfolgerauschen als Unterschied
gezählt wird.

## Zielnutzer und Nichtziel

Zielnutzer ist der Entwickler, der einen bereits aufgezeichneten Durchlauf
nachvollzieht — nicht der Live-Beobachter (das ist Plan 002) und nicht der
Prozess-Debugger (das ist [Plan 004](004-process-debugging.md)).

Nicht das Ziel: Wieder-Ausführung mit rückgängigen Nebenwirkungen,
synthetisches Ausrichten paralleler Vorgänge zu einer Gesamtreihenfolge oder
Änderung des IST-Snapshots einer Aufzeichnung durch nachträgliche
Codeänderungen.

## Fähigkeiten

- Zeitleiste über korrelierte Ereignisse einer Aktion; „Nächste Zustands-
  änderung", „nächster Request", „nächste Abweichung", „in diesen Baustein
  hinein" begrenzen die Menge.
- Vor/zurück durch die Aufzeichnung; Inspector zeigt den ausgewählten Aufruf,
  die Ursache (soweit belegt), die Quellstelle und die erfassten
  Zustandsänderungen. Beispiel: `selectedArtifactId: vorher → nachher`, Cache
  ergänzt, Request gestartet, Antwort eingetroffen.
- Rekonstruktion des erfassten Zustands aus Startzustand und Deltas.
- Beobachtungspunkte halten die Wiedergabe bei einem Befund an (etwa erneutes
  Laden trotz warmem Cache im optionalen Vergleich mit SOLL-Regeln). Das ist
  kein Breakpoint auf einem SOLL-Knoten.
- Vergleich zweier Durchläufe nach den unten festgelegten Regeln.
- KI kann erklären, warum der ausgewählte Schritt erfolgte, soweit
  Ursachenbelege vorhanden sind.

## Was „Vergleich zweier Durchläufe" heißt

Verglichen werden nicht Zeitachsen, sondern eine pro Klick-Aktion geordnete
Menge korrelierter Ereignisse:

- Requests mit Ziel und Statusfamilie.
- Zustandsdeltas ausgewählter Store-Felder.
- Spans an vereinbarten Beobachtungspunkten.

Ein Unterschied ist ein fehlendes oder zusätzliches Ereignis, ein abweichender
Zielendpunkt oder ein anderer Statusausgang. Reine Timingunterschiede und eine
andere Reihenfolge nebenläufiger Ereignisse sind kein Unterschied, solange die
kausale Verknüpfung erhalten bleibt. Nicht korrelierbare Ereignisse werden
separat gelistet und weder als „gleich" noch als „anders" gezählt.

Feldwerte, die nicht zur freigegebenen State-Aufzeichnung gehören, tragen
nicht zum Vergleich bei. Eine Erweiterung des Vergleichs auf zusätzliche
Felder benötigt eine begründete Änderung der Freigabeliste.

## Abnahme

- Deterministischer Replay eines aufgezeichneten Klicks aus Startzustand und
  Deltas.
- Tests für fehlende Ereignisse, parallele Klicks, späte Spans, geänderte
  Zuordnung, Cache kalt/warm.
- Vor-/Zurückschalten löst keine Anwendungsrequests aus.
- Mindestens ein Testfall pro Unterschiedskategorie im Zwei-Durchlauf-
  Vergleich: fehlend, zusätzlich, abweichender Endpunkt, abweichender
  Statusausgang.
- Ein Testfall mit anderer Nebenläufigkeitsreihenfolge wird ausdrücklich
  nicht als Unterschied gewertet.
- Root-Gates grün: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Gate 5b → 6 (Bedingung für [Plan 004](004-process-debugging.md))

Stufe 6 darf erst begonnen werden, wenn zusätzlich zu den Abnahmepunkten oben:

- Ein enger Spike mit [CDP](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/)
  oder [JDWP](https://docs.oracle.com/en/java/javase/21/docs/specs/jpda/architecture.html)
  belegt eine bestätigte Breakpoint-Request-Zuordnung ohne globale Request-ID.
- Der Spike zeigt zusätzlich, wie konkurrierende Requests während eines Halts
  sichtbar bleiben.
- Der Spike ist mit Ergebnisprotokoll dokumentiert; ein negativer Spike stoppt
  Stufe 6 dieser Iteration und wird zurückgestellt. Die Anforderung wird
  nicht durch eine schwächere Ersatzlösung ausgetauscht.
