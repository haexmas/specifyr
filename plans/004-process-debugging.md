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
preiszugeben. Dafür gibt es eine Testmatrix mit ansonsten identischem Benutzer
und identischer Frontend-Sitzung: jeweils eine fremde Backend-Instanz, eine
fremde `DebugSession`, ein fremdes `buildId` und ein fremdes `snapshotId` werden
separat eingesetzt. Jede Variante wird für Breakpoint-Erstellung,
`DebuggerStop`-Zustellung, Variableninspektion, Fortsetzen und Einzelschritte
geprüft. Alle Ablehnungen verwenden dieselbe nicht aufschlussreiche Antwort;
weder Existenz noch Inhalt der fremden Ressource werden verraten.

Ein Debugger-Stopp muss sofort angezeigt werden können, auch wenn der
zugehörige Span noch offen und noch nicht exportiert ist. Der Debuggeradapter
sendet dafür über einen direkten Live-Kanal eine `DebuggerStop`-Meldung mit dem
eindeutigen Schlüssel (`debugSessionId`, `correlationKey`, `stopId`), Benutzer-,
Frontend-Sitzungs- und Backend-Instanzbindung, `buildId`, stopSequence und
SourceRef; alternativ fragt die IST-Ansicht diesen Schlüssel live beim Adapter
nach. Das Zusammenführen ist anhand dieses Schlüssels idempotent: Retries und
Duplikate erzeugen keine zweiten Stopps. Ein vermeintliches Duplikat darf nur
zusammengeführt werden, wenn auch die unveränderlichen Felder `buildId`,
SourceRef, stopSequence sowie Benutzer-, Frontend-Sitzungs- und Backend-
Instanzbindung exakt übereinstimmen. Bei einer Abweichung wird die Meldung
zurückgewiesen, der bestehende Stopp bleibt unverändert und eine nachvollziehbare
Konfliktdiagnose ohne fremde Inhalte wird protokolliert.

Veränderliche Kontextdaten werden davon getrennt und kommutativ angereichert:
identische Callstack-Frames, Variablenwerte und pausierte Quellkontextfelder sind
idempotent; fehlende Felder dürfen ergänzt werden. Bei Callstacks gewinnt nur
eine strikt vollständigere, zum bisherigen Stack präfixkompatible Darstellung.
Variablen und Quellkontext werden als kanonische Feldmengen vereinigt.

Die Frame-Identität ist zunächst `(debugSessionId, correlationKey, stopId,
threadOrTaskId, frameIndex)`; Funktion und `SourceRef` sind anreicherbare
Attribute und nicht Teil des Schlüssels. Fehlen Thread/Task oder Frame-Index,
vergibt der Adapter einen dauerhaft gespeicherten vorläufigen Schlüssel aus
Stop-Schlüssel, Adapter-Generation und stabiler Frame-Ordinalposition. Eine
Aufwertung zu konkreten Identitätsfeldern schreibt eine persistierte
`provisionalFrameId -> frameId`-Zuordnung und darf nur den bestehenden Frame
ersetzen, nie einen zweiten erzeugen. Die Scope-Identität ergänzt
`(frameId, scopeKind, scopeOrdinal, scopeName)`. Ein Variablenpfad besteht aus
dieser Scope-Identität plus kanonisch escaped Property-Segmenten. Ein
Quellkontextfeld wird durch `(contextNamespace, kanonischer Feldpfad)`
identifiziert. Gleichnamige Variablen in verschiedenen Frames oder Scopes
bleiben dadurch getrennt; eine Sequenz von „fehlend“ zu „konkret“ behält Frame
und Scope.

Für jeden Stopp wird außerdem eine persistierte `contextRevision` geführt.
Jede Anreicherung läuft als serialisierte Compare-and-Swap-Transaktion:
Revision lesen, kanonisch zusammenführen, nur bei unveränderter Revision
schreiben und die Revision erhöhen; bei einem Versionskonflikt wird gegen den
neuen Stand erneut gerechnet. Zwei unterschiedliche konkrete Werte für dieselbe
Identität werden niemals überschrieben, sondern als deterministisch sortierte
Wertmenge im Zustand `Kontextkonflikt` mit Diagnose gespeichert. Dadurch bleibt
der angezeigte Inspector-Zustand unabhängig von Zustellreihenfolge und auch bei
gleichzeitigen Anreicherungen erhalten. Der Konflikt betrifft nicht die
unveränderlichen Daten des bestehenden Stopps.

Die Zustände einer Kontextbeobachtung sind getrennt: `fehlend` bedeutet keine
Beobachtung und ist kein Wert; `null` ist ein tatsächlich beobachteter Wert;
`nicht verfügbar` bedeutet, dass die Instrumentierung keinen Wert liefern
konnte; `redigiert` bedeutet, dass ein Wert aufgrund der Berechtigung verborgen
wurde. Nur `nicht verfügbar` darf durch eine konkrete Beobachtung ersetzt
werden. `redigiert` darf nur innerhalb derselben explizit autorisierten Sicht
aufgewertet werden; eine spätere Anreicherung aus einer anderen Sicht darf nie
geschützte Inhalte offenlegen. `null` und `redigiert` werden nicht durch
konkrete Werte aus einer nicht autorisierten Sicht ersetzt.

Der Adapter führt pro `DebugSession` eine strikt eindeutige, monotone
`stopSequence`. Der Cursor ist der höchste lückenlose bestätigte Präfix, initial
bei 0. Nach Reconnect werden Einträge ab diesem Cursor erneut angefordert; die
Bestätigung darf nur in Sequenzreihenfolge erfolgen. Trifft beispielsweise 12
vor 11 ein, wird 12 gepuffert und weder bestätigt noch als Cursor gesetzt, bis
11 eingetroffen und geprüft ist. Danach werden 11 und 12 in Reihenfolge
übernommen. Nichtlineare Zustellung wird durch Puffern oder erneute Zustellung
behandelt; eine spätere Sequenz darf keine frühere Lücke überspringen.
Die Ansicht zeigt bei Kanalverlust eine Diagnose und keinen still erfundenen
Zustand.

`nextStopSequence` und der zuletzt bestätigte lückenlose Cursor werden dauerhaft
im Zustand der `DebugSession` gespeichert. Jeder `DebuggerStopRecord` speichert
zusammen mit seiner Sequenz den vollständigen eindeutigen Schlüssel
`(debugSessionId, correlationKey, stopId)`; darauf liegt ein persistierter
Idempotenzindex. Die Vergabe des nächsten Werts ist Teil einer gemeinsamen
atomaren Transaktion mit dem zugehörigen dauerhaft gespeicherten
`DebuggerStopRecord` im Zustand `pending` (alternativ einem expliziten
`gap`-Marker): Sequenzwert, Datensatz und inkrementierter `nextStopSequence`
werden gemeinsam geschrieben oder gemeinsam verworfen. Vor jeder Vergabe wird
der Idempotenzindex geprüft: Existiert der Schlüssel bereits mit identischen
unveränderlichen Bindungen, liefert der Retry exakt denselben Datensatz
einschließlich `stopSequence` zurück; nur ein unbekannter Schlüssel darf eine
neue Sequenz erhalten. Eine abweichende Bindung wird als Konflikt abgewiesen.
Damit erzeugt auch ein Commit nach anschließend verlorenem Live-Response beim
erneuten Senden weder eine neue Sequenz noch eine Lücke.

Ein Adapter-Neustart lädt diesen Zustand und liefert jeden `pending`-Datensatz ab
dem Cursor erneut, bevor eine spätere Sequenz bestätigt wird. Eine Session darf
nicht fortgeführt werden, wenn der persistierte Sequenzzustand nicht geladen
oder nicht atomar aktualisiert werden kann; stattdessen erscheint eine
Diagnose. So werden bereits bestätigte Werte weder wiederverwendet noch wird
der Cursor unterschritten. Ein Absturz nach dieser Transaktion, aber vor der
Live-Zustellung, hinterlässt den Stopp zur erneuten Zustellung; ein Absturz
innerhalb der Transaktion hinterlässt weder einen inkrementierten Zähler noch
einen verwaisten Datensatz.

Für gespeicherte Stopps gilt eine idempotente Zustandsmaschine. `pending` ist
der einzige wiederzustellende Zustand. Die Zustellung kann genau einmal in
`confirmed` (Bestätigung), `stale` (veraltet, etwa nach Fortsetzen, Timeout
oder Session-Schließung) oder `conflict` (abweichende unveränderliche Daten)
enden; jeder dieser Zustände ist terminal für die Zustellung. Ein bestätigter
Stopp hat zusätzlich den Steuerzustand `open`, der nach erfolgreich
quittiertem Fortsetzen oder Einzelschritt genau einmal in den terminalen
Zustand `continued` übergeht. Die beiden Zustandsdimensionen haben damit die
erlaubten Übergänge `pending -> confirmed|stale|conflict` für die Zustellung
sowie `confirmed/open -> continued` für die Steuerung; alle anderen Übergänge
werden idempotent mit dem bereits gespeicherten Endzustand beantwortet. Beim Neustart werden ausschließlich `pending`-Einträge erneut
zugestellt, nie `confirmed`, `continued`, `stale` oder `conflict`.

Terminale Datensätze werden mindestens für die konfigurierte Debug-Session-
Aufbewahrungsfrist gehalten. Danach wird der große Kontext bereinigt, aber ein
kompakter Tombstone mit Stop-Schlüssel, `stopSequence`, unveränderlichem
Bindungs-Digest und Endzustand bis zum Ende des maximalen Retry-Fensters
behalten; erst danach darf er gelöscht werden. So bleiben Commit-then-timeout-
Retries idempotent, ohne unbegrenzt Stop-Inhalte aufzubewahren.

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
- Die negative Isolationstest-Matrix variiert Backend-Instanz, `DebugSession`,
  `buildId` und `snapshotId` jeweils einzeln bei identischem Benutzer und
  identischer Frontend-Sitzung; alle fünf Operationen werden ohne Existenz- oder
  Inhaltsleck abgewiesen.
- Duplikate, Retries, Reconnects, Kanalverlust, veraltete Stopps und ein
  Lookup-Race mit Fortsetzen liefern den festgelegten idempotenten bzw.
  diagnostizierten Zustand.
- Ein Konflikttest mit gleichem Stop-Schlüssel, aber abweichendem `buildId`,
  SourceRef, stopSequence oder Sitzungsbindung weist die Meldung zurück, ohne
  den ursprünglichen Stopp zu überschreiben.
- Ein Merge-Test liefert denselben Inspector-Zustand bei vertauschter Zustellung
  zweier gleicher, anreichernder Kontextdaten. Widersprüchliche Callstacks,
  Variablen oder Quellkontextfelder werden als unbekannt/Konflikt markiert und
  überschreiben den bestehenden Stopp nicht.
- Ein Race-Test führt zwei gleichzeitige Anreicherungen mit unterschiedlichen
  konkreten Werten über dieselbe `contextRevision` aus; eine CAS-/Retry-Runde
  bewahrt beide Werte als Konflikt und liefert bei vertauschter Zustellreihenfolge
  denselben Inspector-Zustand.
- Ein Scope-Test zeigt gleichnamige Variablen in zwei unterschiedlichen Frames
  oder Scopes getrennt; eine Anreicherung von fehlendem zu konkretem Frame-
  Kontext dupliziert weder Frame noch Variable. `fehlend`, `null`, `nicht
  verfügbar` und `redigiert` folgen den definierten Ergänzungs- und
  Berechtigungsregeln.
- Ein Zustelltest mit 12 vor 11 bestätigt erst den lückenlosen Präfix bis 12,
  nachdem 11 geprüft wurde; 12 wird bis dahin gepuffert oder erneut geliefert.
- Ein Neustart-/Reconnect-Test lädt `nextStopSequence` und den bestätigten Cursor
  aus der `DebugSession`, vergibt danach keinen alten Wert erneut und setzt keine
  Sequenzlücke hinter dem Cursor fort.
- Ein Absturztest zwischen atomarer Sequenz-/Stop-Speicherung und Live-Zustellung
  stellt den `pending`-Stopp nach Neustart erneut zu, bevor die nächste Sequenz
  verwendet oder der Cursor weitergeschoben wird.
- Ein Commit-then-timeout-Retry-Test verliert die Antwort nach erfolgreichem
  Commit und sendet denselben Stop-Schlüssel erneut; der vorhandene Datensatz
  einschließlich identischer `stopSequence` wird zurückgegeben.
- Ein Zustandsautomatentest prüft die Übergänge von `pending` nach `confirmed`,
  `stale` oder `conflict` sowie `confirmed/open -> continued`, lehnt alle
  anderen Übergänge ab und stellt nach Neustart ausschließlich ungelöste
  `pending`-Einträge erneut zu. Aufbewahrung und Tombstone-Bereinigung werden
  über das Retry-Fenster geprüft.
- Der Fall liefert verständliche Diagnosen bei Quell-/Build-Mismatch,
  fehlender Quellzuordnung und konkurrierendem Request.
- Der Ablauf funktioniert ohne SOLL-/PLAN-Modell.
- Ein optionaler Vergleich verändert weder den IST-Ausführungspunkt noch
  gesetzte Breakpoints; SOLL/PLAN bieten keine eigene Debugger-Steuerung.
- Root-Gates grün: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

Vor Implementierung eigenen Spike- und Umsetzungsplan mit geeigneter lokaler
Backend-Konfiguration und überprüften Debuggerfähigkeiten erstellen.
