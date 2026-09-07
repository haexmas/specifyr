# Editor-Weiterentwicklung

Erstellt am 2026-09-07 mit dem Skill `improve`. Produkt- und Architekturplanung,
keine implementierten Änderungen. Referenzfall: Artefakt-Auswahl über
`analyze-frontend` und `analyze-backend` hinweg.

| Plan | Inhalt | Priorität | Aufwand | Abhängigkeiten | Status |
|---|---|---|---|---|---|
| [001](001-editor-perspectives-and-state-comparison.md) | Perspektiven, SOLL/PLAN/IST-Vergleich und repoübergreifende Abläufe (Zielbild, Stufen 1–5 als Roadmap) | P1 | L, mehrere Ausbaustufen | keine | DRAFT |
| [002](002-live-observation-execution-tracing.md) | Stufe 5a: echte Browseraktionen live in IST verfolgen | P2 | L | 001 | DRAFT |
| [003](003-recording-exploration.md) | Stufe 5b: aufgezeichnete Durchläufe untersuchen und vergleichen | P2 | L | 002 (Gate 5a → 5b) | DRAFT |
| [004](004-process-debugging.md) | Stufe 6: Backend-Prozess-Debugging aus dem Browserklick heraus | P3 | XL | 003 (Gate 5b → 6, Spike-Ergebnis) | DRAFT |

Plan 001 enthält das Zielbild und einen eingegrenzten ersten Umsetzungsschnitt.
Die späteren Stufen sind eine Roadmap; ihre Implementierungspläne werden anhand
der jeweiligen Vorstufe konkretisiert. DRAFT bedeutet ausdrücklich: Vorschlag
zur gemeinsamen Weiterentwicklung, keine bereits beschlossene Ablösung des
Designs unter `docs/plans/`.

Die Ausbaustufen zur echten Ausführung in der IST-Ansicht sind aus Plan 001
in eigene Pläne 002/003/004 ausgelagert. Zwischen ihnen liegen ausdrückliche
Go/No-Go-Gates; ein negativer Spike stoppt Stufe 6, statt sie durch eine
schwächere Ersatzlösung zu ersetzen.

Reihenfolge: Explorer und Projektionen → SOLL bearbeiten → PLAN und Vergleich →
statischer Ablauf über Vue/TypeScript und Java/Spring → Laufzeitbelege.
KI-Abfragen können ab der ersten stabilen Projektionsschnittstelle entstehen;
sie erhalten später zusätzliche Ablauf- und Trace-Werkzeuge.

Ergänzung: echte Browseraktionen in IST verfolgen (5a, [Plan 002](002-live-observation-execution-tracing.md)),
aufgezeichnete Aufrufe und Zustandsänderungen schrittweise untersuchen
(5b, [Plan 003](003-recording-exploration.md)), später sprach-/runtimeabhängige
Breakpoints (6, [Plan 004](004-process-debugging.md)). Echte Backend-Ausführung
nach einem Browserklick in IST debuggen ist ein ausdrücklich gewünschter
Akzeptanzfall in Plan 004.

Debugger-Steuerung, Breakpoints und Ausführungspunkt gehören ausschließlich in
IST der ausgeführten Version. SOLL (Nutzerentwurf) und PLAN (Speckit-Ausarbeitung)
können daneben verglichen werden; Debugging benötigt keinen dieser Entwurfsstände.

Sprachübergreifendes Ziel: C#, C++, Python, Java und JS/TS explizit einplanen,
weitere Sprachen über Adapter ergänzen. Gemeinsames Modell und UI, getrennte
Fähigkeiten für Codeanalyse, Traces, Zustandshistorie und Debugging. OpenTelemetry
und DAP als gemeinsame Integrationsgrundlagen prüfen; eine zweite Sprache dient
früh als Gegenprobe für die Adapterverträge. ANALYZE ist der erste Referenzfall.

Nicht verfolgt: vollständigen Graphen lediglich schöner anordnen; alle
Sprachadapter vor der ersten UI-Verbesserung bauen; Graphdatenbank als
Voraussetzung; wiederholte Requests pauschal als Fehler einstufen.

Untersuchungsumfang: Editor, Modell, Extraktion, Speicherung, bestehendes Design
und ein ausgewählter Ablauf in den beiden ANALYZE-Repositories. Kein allgemeines
Security-Audit, keine Laufzeitmessung und keine vollständige Prüfung sämtlicher
Nebenwirkungen der Artefakt-Auswahl.
