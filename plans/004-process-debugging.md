# Plan 004: Prozess-Debugging aus dem Browserklick heraus (Stufe 6)

- Status: DRAFT — Produkt- und Umsetzungsvorschlag für Stufe 6.
- Priorität: P3; Aufwand: XL; Risiko: HIGH (Sprach-/Runtime-Adapter,
  Request-korrelierte Breakpoints, verteilter Halt ist nicht atomar).
- Voraussetzung: [Plan 003](003-recording-exploration.md) ist abgenommen und
  das Gate 5b → 6 einschließlich Spike-Ergebnis ist bestanden.
- Basis: [Plan 001](001-editor-perspectives-and-state-comparison.md) für
  Modell und Quellzuordnung, [Plan 002](002-live-observation-execution-tracing.md)
  für Action-/Request-Korrelation.

## Ziel und Erfolgskriterium

Ein Klick im echten Frontend löst das echte Backend aus. In specifyr wird
dessen Ausführung in der IST-Ansicht sichtbar und dort debuggt: an Quellstellen
anhalten, Variablen inspizieren, echte Ausführung fortsetzen. Backend-Prozess-
Debugging ist ausdrückliches Produktziel dieser Stufe, nicht bloß eine
optionale Idee.

Erster sichtbarer Erfolg für den Referenzfall ANALYZE: aus einem echten
Browserklick einen bestätigten Backend-Breakpoint erreichen, den richtigen
IST-Baustein markieren, die Artefakt-ID im pausierten Kontext prüfen, einen
Backend-Schritt ausführen und fortsetzen.

## Zielnutzer und Nichtziel

Zielnutzer ist der Entwickler mit erweitertem Backend-Debuggerzugriff auf eine
Entwicklungsinstanz. Nicht das Ziel: automatisch atomarer Halt des verteilten
Systems, deterministisches Wieder-Ausführen der gesamten Anwendung, Rollback
ihrer Nebenwirkungen, garantierte „Architektur-Schrittoperation“ über DAP.

## Verbindlicher Zielablauf: Browserklick → Backend in IST debuggen

Bedienung für ANALYZE:

1. In specifyr die IST-Perspektive „Backend“ öffnen und mit einer geeigneten
   Entwicklungsinstanz von analyze-backend verbinden. Frontend, Backend-Build,
   SourceRefs und IST-Snapshot dieser Sitzung identifizieren.
2. Auf einer IST-Methode oder einem IST-Baustein — beispielsweise dem
   implementierten Artefakt-Service — „Bei Eintritt anhalten“ wählen. Die
   Zuordnung zum ausgeführten Build liefert die konkreten Methoden/
   Quellstellen. Bei mehreren möglichen Einstiegspunkten auswählen lassen oder
   die konkrete Gruppe anzeigen. Der Debugger muss das Setzen bestätigen.
3. „Nächste Artefakt-Auswahl verfolgen“ aktivieren und im ANALYZE-Browser
   klicken. Dabei wird ein einmalig verwendbares `selectionToken` an Benutzer,
   Frontend-Sitzung, Backend-Instanz, `DebugSession` und Build gebunden. Es
   verfällt bei Abbruch, Sitzungsende oder nach einer kurzen TTL und wird beim
   ersten exakt passenden Klick einmalig verbraucht. Beim Request-Start entsteht
   ein eigener `requestChildKey`; die persistierte Zuordnung lautet
   `selectionToken → actionParentKey → requestChildKey → eventKey`. Ein Retry
   erhält einen neuen Request-Child-Key und darf das verbrauchte Token nicht
   wiederverwenden. Der echte Request erreicht das Backend; zwei überlappende
   Tokens bleiben getrennt.
4. Das Backend hält an der vereinbarten Stelle. Der zugeordnete IST-Knoten
   wird markiert; der Inspector zeigt aktuelle Quellstelle, Callstack und die
   im pausierten Kontext verfügbaren Variablen (etwa Artefakt-ID und
   Methodenparameter).
5. „Hinein“, „Darüber“, „Heraus“ und „Fortsetzen“ steuern den Backend-Debugger.
   Die IST-Markierung folgt der aktuell ausgeführten Implementierung. Mehrere
   Quellschritte können im selben Architekturbaustein bleiben. „Nächster
   Baustein“ ist eine spätere zusammengesetzte Operation mit bestätigten
   Zielbreakpoints, keine von DAP garantierte atomare Architektur-
   Schrittoperation.
6. Bei Fortsetzung kann das Backend antworten; Frontend und Trace-Ansicht
   zeigen die korrelierten Folgen. Nicht zugeordneter Code bleibt über
   Quellansicht und temporären IST-Kontext erreichbar. Ein realer Halt
   erweitert die Abdeckung nicht automatisch zu einer vollständigen Historie
   aller Zustandsänderungen.

## Technische Verantwortungen

- Instrumentierung und Kontextweitergabe (aus Plan 002) ordnet die Aktion dem
  Request zu.
- Der Debugger steuert die Backend-Ausführung.
- Quellzuordnung und Projektion zeigen diese Ausführung in IST.

Jede Debuggeroperation prüft vor Ausführung Principal/Benutzer, Frontend-Sitzung,
Backend-Instanz und `DebugSession`; Breakpoint-Ziel, Build und Snapshot müssen
ebenfalls zu dieser Sitzung passen. Das gilt ausdrücklich für Breakpoint-
Erstellung, `DebuggerStop`-Zustellung, Variableninspektion, Fortsetzen sowie
Einzelschritte. Ein negativer Cross-Session-Test muss den Zugriff auf fremde
Breakpoints, Stopps, Variablen und Steuerbefehle ablehnen, ohne ihre Inhalte
preiszugeben.

Ein Debugger-Stopp muss sofort angezeigt werden können, auch wenn der
zugehörige Span noch offen und noch nicht exportiert ist. Der Debuggeradapter
sendet dafür über einen direkten Live-Kanal eine `DebuggerStop`-Meldung mit dem
eindeutigen Schlüssel (`debugSessionId`, `correlationKey`, `stopId`), Benutzer-,
Frontend-Sitzungs- und Backend-Instanzbindung, `buildId`, stopSequence und
SourceRef; alternativ fragt die IST-Ansicht diesen Schlüssel live beim Adapter
nach. Das Zusammenführen ist anhand dieses Schlüssels idempotent: Retries und
Duplikate erzeugen keine zweiten Stopps.

Der Adapter führt pro DebugSession eine monotone stopSequence. Nach Reconnect
werden nur Einträge ab der zuletzt bestätigten Sequenz erneut geliefert; die
Ansicht zeigt bei Kanalverlust eine Diagnose und keinen still erfundenen Zustand.
Läuft die konfigurierte Zustell- oder Lookup-Frist ab, bleibt der Zustand
„Stop ausstehend“ mit einer sichtbaren Timeout-/Kanalverlustdiagnose bestehen;
ein Stopp wird daraus nicht erraten. Ein späterer Reconnect darf nur über die
Sequenzprüfung fortsetzen.
Ein Stopp, der nach bestätigtem Fortsetzen oder einem Einzelschritt eintrifft,
ist veraltet und wird nicht als aktueller Stopp angezeigt. Ein Lookup-Race wird
über Sessionzustand und Sequenz entschieden: Fortsetzen gewinnt für Stopps, die
noch nicht angenommen wurden; ein bereits angenommener Stopp bleibt bis zum
Steuerbefehl offen.

Später exportierte Spans dürfen nur den offenen Debuggerzustand mit exakt
passendem `debugSessionId`, `correlationKey` und `stopId` ergänzen. Abgeschlossene
oder fremde Sitzungszustände bleiben unverändert. DAP liefert eine
Trace-/Request-Zuordnung nicht automatisch.

## Grenzen und Risiken

- Pausieren kann Timeouts und beobachtetes Timing verändern; das muss in der
  Sitzung sichtbar sein.
- Requestbezogene Breakpoints hängen von Adapterfähigkeiten und zugänglichem
  Requestkontext ab. Zunächst isolierte lokale Diagnosesitzung mit einem
  kontrollierten Request abnehmen; anschließend überlappende Requests,
  bedingte Breakpoints, Thread-/Task-Wechsel und asynchrone Fortsetzungen
  testen. Keine globale aktuelle Request-ID verwenden.
- Tatsächlichen Stop-Umfang (Thread/Prozess) anzeigen; andere Requests dürfen
  nicht still als Teil des ausgewählten Klicks dargestellt werden.
- Frontend-Timeouts oder Retries während des Backend-Halts bleiben sichtbar
  und werden nicht als unverändertes Normalverhalten interpretiert.
- Deterministisches Wieder-Ausführen der gesamten verteilten Anwendung und
  Rollback ihrer Nebenwirkungen sind kein Bestandteil dieser Stufe.

Adaptergrundlagen: [Chrome DevTools Debugger Protocol](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/)
und [Java JPDA/JDI/JDWP](https://docs.oracle.com/en/java/javase/21/docs/specs/jpda/architecture.html).
Zuerst enger Spike für eine Runtime (siehe Gate 5b → 6 in Plan 003). Für
andere Zielsprachen bleibt der Ablauf identisch; Runtime-/Debuggeradapter und
Instrumentierung wechseln.

## Abnahme

- Aus echtem Browserklick wird ein bestätigter Backend-Breakpoint erreicht.
- Der richtige IST-Baustein wird markiert.
- Die Artefakt-ID ist im pausierten Kontext prüfbar.
- Ein Backend-Schritt wird ausgeführt, danach fortgesetzt.
- Zwei überlappende Klicks und ein Retry bleiben über Selection-Token,
  Action-Parent-Key und Request-Child-Keys isoliert.
- Ein negativer Cross-Session-Test weist fremde Breakpoints, Stopps,
  Variableninspektionen, Fortsetzen und Einzelschritte ab.
- Duplikate, Retries, Reconnects, Kanalverlust, veraltete Stopps und ein
  Lookup-Race mit Fortsetzen liefern den festgelegten idempotenten bzw.
  diagnostizierten Zustand.
- Der Fall liefert verständliche Diagnosen bei Quell-/Build-Mismatch,
  fehlender Quellzuordnung und konkurrierendem Request.
- Der Ablauf funktioniert ohne SOLL-/PLAN-Modell.
- Ein optionaler Vergleich verändert weder den IST-Ausführungspunkt noch
  gesetzte Breakpoints; SOLL/PLAN bieten keine eigene Debugger-Steuerung.
- Root-Gates grün: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

Vor Implementierung eigenen Spike- und Umsetzungsplan mit geeigneter lokaler
Backend-Konfiguration und überprüften Debuggerfähigkeiten erstellen.
