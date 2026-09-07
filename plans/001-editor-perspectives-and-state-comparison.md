# Plan 001: Architektur aus mehreren Perspektiven entwerfen und vergleichen

- Status: DRAFT — Produktentwurf mit erstem Umsetzungsschnitt und Ausbauplan.
- Priorität: P1; Aufwand: L insgesamt, M für den ersten Schnitt; Risiko: MED für
  den Explorer, HIGH für belastbares Matching und Laufzeitkorrelation.
- Geplant gegen specifyr `43a519b`, 2026-09-07.
- Referenzen: analyze-frontend `b4eac748`, analyze-backend `c404189db`.
- Ausgangspunkt: `/home/haex/Projekte/specifyr`.

## Ziel und Erfolgskriterium

Der Nutzer soll eine Frage an seine Anwendung stellen und einen überschaubaren,
nachvollziehbaren Ausschnitt erhalten: Aufbau, Ablageort, Abhängigkeiten oder
Verhalten. Derselbe Ausschnitt ist in SOLL, PLAN und IST vergleichbar.
Referenzfall ist „Artefakt im ANALYZE-Explorer auswählen“ über zwei Repositories.

Erster sichtbarer Erfolg: Ordner oder Symbol finden, auswählen, im Kontext seiner
Abhängigkeiten betrachten und zum Dateisystem zurückspringen, ohne den gesamten
Codegraphen manuell zu entwirren. Vollständiges Ziel: diesen Kontext entwerfen,
mit dem Speckit-Plan und der Implementierung vergleichen sowie beobachtete
Requests und DB-Zugriffe eines konkreten Durchlaufs nachvollziehen.

## Verifizierter Ausgangspunkt

Die Tabelle und Ausschnitte beziehen sich auf den zu Beginn gelesenen Stand
`43a519b`. Während der Planung wurde `frontend/pages/index.vue` außerhalb dieser
Planungsarbeit geändert: ELK ist im abschließend geprüften Arbeitsbaum bereits
angebunden und ersetzt das Raster. Diese Änderung wurde nicht von dieser Planung
vorgenommen oder verändert. Sie muss beim Umsetzungseinstieg erhalten bleiben;
die nachstehenden ELK-Schritte bedeuten dann Integration mit den Projektionen,
nicht erneutes Einbauen des Composables. Auswahl bleibt in diesem Diff deaktiviert.

In specifyr gibt es keine `.haex-hive.json`, keine Root-AGENTS.md und keine
Root-CLAUDE.md. Auch die zwei Referenzrepos haben keine `.haex-hive.json`.
Ihre vorhandenen CLAUDE.md wurden für den jeweiligen Lesezugriff berücksichtigt.

| Datei in specifyr | Befund |
|---|---|
| `frontend/pages/index.vue:9` | Nur SOLL/IST-Auswahl, kein PLAN oder Vergleich. |
| `frontend/pages/index.vue:15` | Alle Modellknoten werden in ein starres Raster übersetzt. |
| `frontend/pages/index.vue:75` | `elements-selectable` ist `false`. |
| `frontend/composables/useElkLayout.ts` | ELK-Composable vorhanden, in der Seite noch nicht verwendet. |
| `src/extractors/typescript/extract-source.ts:37` | Datei als `module`, zusätzliche Top-Level-Symbole; kein expliziter Pfad am Symbol, keine Quellspanne und keine Datei-Symbol-Kante. |
| `src/extractors/typescript/walk.ts` | Nur `.ts`/`.tsx`, feste Ausschlussliste; kein allgemeiner Dateibaum und kein Vue-SFC-Adapter. |
| `src/extractors/typescript/extract.ts` | Relative Modul-Imports; keine Call-, Watcher-, HTTP- oder DB-Analyse. |
| `src/extractors/typescript/node-id.ts` | ID aus relativem Pfad und Symbolnamen; Umbenennen verschiebt Identität, Repo-Namensraum fehlt. |
| `src/core/schemas.ts` | Gemeinsames Model und offene Node-Attribute; Edges ohne Evidence-Felder; Metadaten ohne Revision und Abdeckung. |
| `src/storage/soll.ts` | SOLL-Dateispeicherung vorhanden; Views/Layout aus dem Design noch nicht implementiert. |
| `frontend/server/utils/ist.ts` | Einzelnes Repository über `SPECIFYR_REPO_PATH`, Extraktion je Anfrage. |

Relevante bestehende Codestellen:

```ts
// frontend/pages/index.vue
type ViewSource = "soll" | "ist";
// flowNodes: return data.value.nodes.map((node, index) => (...));

// src/extractors/typescript/extract-source.ts
nodes.push({
  id: istNodeId(relativePath, ""),
  type: "module",
  name: relativePath,
  classes: [],
});
```

Das aktuelle TypeScript-Design vom 2026-09-06 sieht Views, Frames, Undo/Redo,
SOLL-Dateispeicherung und überprüfbare KI-Patches bereits vor. Daran anknüpfen.
`docs/architecture.md` und `docs/roadmap.md` beschreiben teilweise noch den
früheren Checker; ihre als implementiert bezeichneten Funktionen sind kein
Nachweis für den Rewrite. Ihr Prinzip „unbekannt ist nicht falsch“ bleibt für
unvollständige Extraktion und Drift sinnvoll.

Dieser Vorschlag erweitert das frühere Design ausdrücklich um direkten
SOLL↔IST-Vergleich, mehrere Repositories, Laufzeitbelege und optionale eingefrorene
IST-Snapshots. Letzteres verändert „IST never persisted“: Live-IST bleibt
abgeleitet, ein reproduzierbarer Vergleich darf einen identifizierten Stand
referenzieren. Eine entsprechende Designänderung ist Teil einer späteren Umsetzung.

## Bedienkonzept

Drei unabhängige Entscheidungen statt eines überladenen „View“-Schalters:

1. **Stand:** SOLL, PLAN oder IST; alternativ Vergleich mit frei gewähltem Paar.
2. **Perspektive:** Architektur, Dateien, Abhängigkeiten, Ablauf oder Daten.
3. **Fokus:** Repositories, Teilbereich, ausgewählte Entität oder Szenario.

IST-Abläufe haben zusätzlich die Auswahl „aus Code abgeleitet“ / „beobachtet“.
Beobachtet ist eine Evidenzart des IST, kein vierter konkurrierender Sollzustand.

```text
Workspace ANALYZE | IST / Vergleichen | Architektur Dateien Abhängigkeiten Ablauf Daten
Fokus: Explorer > Artefakt-Auswahl | Suche | Filter | Ansicht speichern
┌───────────────────┬──────────────────────────────────┬───────────────────┐
│ Explorer          │ Aktuelle Perspektive             │ Details           │
│ Dateien / Module  │ oder synchronisierter Vergleich  │ Quellen / Belege  │
│ / Szenarien       │                                  │ Unterschiede      │
│                   │                                  │ KI zum Ausschnitt │
└───────────────────┴──────────────────────────────────┴───────────────────┘
Bei Bedarf: unterer Bereich für Sequenz, Trace-Zeitleiste oder Ergebnisliste.
```

Die Bereiche sind größenveränderbar und einklappbar. Auswahl in Baum, Grafik,
Suche, Vergleich und KI-Ergebnis meint dieselbe Entität. Auswahl zeigt Details;
„Fokussieren“ oder Doppelklick ändert den Ausschnitt. Dadurch springt die Grafik
nicht bei jeder Inspektion. Breadcrumbs sowie Zurück/Vorwärts erhalten den Weg.

| Perspektive | Frage und Darstellung |
|---|---|
| Architektur | Systeme → laufende Anwendungen/Services → fachliche Module → Symbole. Zunächst nur wenige Gruppen, explizites Aufklappen. |
| Dateien | Virtueller oder realer Ordnerbaum; rechts Inhalte und Zuordnung zu Komponenten/Stores/Klassen. Optional verschachtelte Ordnerflächen, Baum bleibt primärer Navigator. |
| Abhängigkeiten | Gerichteter Graph um Auswahl; Aufrufer, Aufgerufene, Imports oder Änderungsfolgen getrennt wählbar. |
| Ablauf | Szenario als Sequenz mit Bahnen für Browser, Frontend-Module, Backend und Datenhaltung; Bedingungen, parallele Zweige und Rückkopplungen sichtbar. |
| Daten | Stores, Entitäten, Tabellen/Collections und Leser/Schreiber; optional später ein detailliertes Schema-Diagramm. |

Die gestufte Architekturansicht orientiert sich am [C4-Modell](https://c4model.com/diagrams),
das Struktur auf verschiedenen Detailstufen und ergänzende dynamische Diagramme
unterscheidet. Dateisystem und fachliche Architektur bekommen getrennte Hierarchien:
Eine Komponente kann mehrere Dateien umfassen, eine Datei mehrere Symbole.
Ein Repository kann mehrere deploybare Services enthalten; ein Service kann Code
aus mehreren Repositories verwenden. Verbindungen dazwischen sind explizite Zuordnungen.

### Auswahl und Filter

- Standard: Übersicht über Gruppen, keine globale Funktionswolke.
- Suche über Namen, qualifizierte Symbole, Pfade, API-Routen und Szenarien.
- Mehrfachauswahl, „nur Auswahl“, Ausschließen, Anheften, Fokus zurücksetzen.
- Nachbarn: eingehend/ausgehend/beide; Tiefe 1/2/3; Relationstypen getrennt.
- Filter: Repo, Ordner, Schicht, Typ, Produktivcode/Tests/generiert, Driftstatus,
  Evidenzart und unterstützte/unaufgelöste Bereiche.
- Pfad zwischen zwei Entitäten; zyklische Pfade mit Besuchsmenge und Tiefenlimit.
- Sammelkanten mit Anzahl und aufklappbarer Liste der zugrunde liegenden Kanten.
- Sichtbares Limit, beispielsweise 60 Knoten als zu erprobender Startwert;
  bei Überschreitung gruppieren und „N weitere“ anbieten, nie still abschneiden.
- Gespeicherte Ansichten enthalten Abfrage, Gruppierung und Layout, keine
  duplizierten fachlichen Knoten. Persönlicher Navigationszustand bleibt separat.
- Im Vergleich gelten Filter für die Vereinigung beider Seiten; fehlende
  Gegenstücke dürfen nicht durch einseitiges Filtern verschwinden.
- Tastaturbedienung von Suche, Baum und Auswahl; Fokusindikator; Unterschiede
  durch Text/Icon und Farbe; leere Daten, leerer Filter und Ladefehler unterscheiden.

## SOLL entwerfen und mit PLAN/IST vergleichen

SOLL erlaubt Komponenten, Zuständigkeiten, Schnittstellen, Kommunikation und
Szenarien anzulegen. Dazu kommt ein virtueller Dateibaum: Klassen, Stores,
Composables und Views erhalten geplante Pfade oder explizit noch keinen Ablageort.
Verschieben ändert den Architekturentwurf; ein Quellcode-Refactoring ist eine
separate spätere Aktion. Commands ermöglichen Undo/Redo, KI-Änderungen erscheinen
als überprüfbare Patches. Ausgewähltes IST kann als Ausgangsentwurf übernommen
werden, mit Herkunftsverweis statt dauerhafter Gleichsetzung.

PLAN ist an konkrete Speckit-Artefakte und einen Feature-Stand gebunden:
`spec.md`, `plan.md`, `data-model.md`, `contracts/`, `tasks.md` sowie vorhandene ADRs.
Das offizielle [Plan-Template](https://github.com/github/spec-kit/blob/main/templates/plan-template.md)
enthält die geplante Quellstruktur und verweist auf diese Begleitartefakte.
Das Template allein liefert noch keinen verlässlichen maschinenlesbaren Graphen.
Explizite strukturierte Referenzen/Fences zuerst; KI-Interpretationen aus Prosa
als Vorschläge mit Dokumentstelle und Reviewstatus. Ein Speckit-Task mit Häkchen
ist kein Nachweis vorhandenen oder korrekt ausgeführten Codes.

| Vergleich | Zweck |
|---|---|
| SOLL ↔ PLAN | Setzt Speckit den Entwurf um? Was ist zusätzlich vorgesehen oder noch offen? |
| PLAN ↔ IST | Was wurde umgesetzt, anders platziert oder anders verbunden? |
| SOLL ↔ IST | Entspricht die Anwendung meiner Absicht, unabhängig von PLAN? |

Standard ist eine Zweispaltenansicht mit synchronisiertem Fokus, passenden
Gegenstücken und Detaildiff. Overlay optional; alle drei Stände als kompakte
Eigenschaftstabelle im Inspector. Kein erzwungener Dreifach-Canvas.

Verglichen werden Existenz, Verantwortung, Typ, Ablageort, Schnittstellen,
Beziehungen und explizit formulierte Verhaltensregeln. Eine Differenz ist zunächst
beschreibend. Erst eine Regel macht sie zu einer Verletzung.

Matching braucht stabile fachliche IDs und bestätigte Zuordnungen, auch 1:n und
n:m: Ein SOLL-Modul kann in mehrere PLAN-Bausteine und viele IST-Dateien aufgehen.
Kein Namens- oder Pfadmatch darf still als bewiesene Identität gelten. Heuristische
Vorschläge werden bestätigt oder bleiben unsicher. Umbenennungen, Verschiebungen
und Aufteilungen sollen als solche erkennbar werden.

Status: gleich, zusätzlich, fehlt, geändert, verschoben, widersprüchlich,
ungeklärt/nicht geprüft. „Fehlt“ nur bei ausreichender Abdeckung des relevanten
Scopes. Nicht unterstütztes Java/Vue oder ein Parserfehler darf nicht zu
„SOLL-Baustein fehlt“ werden. Ein nicht beobachteter Aufruf ist kein Beweis seiner
Abwesenheit. Beide Seiten zeigen Revision, Scanzeit, Arbeitsbaum-Digest und
Extraktionsabdeckung; Laufzeit zusätzlich Build/Deployment und Messzeitraum.

## Referenzszenario: Artefakt auswählen

Gelesene Repositories:

- `/home/haex/Projekte/analyze-frontend`: Vue 3, TypeScript, Pinia, Vue Router,
  Axios, JointJS; Browserinteraktion umfasst Vue-Komponenten und Graph-Callbacks.
- `/home/haex/Projekte/analyze-backend`: Java/Spring, Gradle-Module, REST → Core
  → Storage; JPA- und ArangoDB-Implementierungen vorhanden.

Der folgende Ausschnitt ist statisch aus dem Code nachvollzogen, nicht gemessen
und keine vollständige Liste aller Auswahl-Nebenwirkungen:

```text
ArtifactTypeContainer.vue:280 — selectArtifact
  → explorerUiStore.setSelectedArtifact
  → register-html-artifact-events.ts:15 — watch(selectedArtifactId)
  → cell-selection.ts:152 — highlightByArtifactId
  → ensureAdjacency → traceDataCoordinator.ts:85 — ensureArtifactAdjacency
  → ArtifactService.rest.impl.ts:18 — getLinkedArtifacts
  → GET /project/{projectId}/snapshot/{snapshotId}/artifacts/{id}/links
  → ArtifactLinksResource.getArtifactLinks
      → SnapshotService.getTraceModel
      → LinkService.getArtifactLinks → LinkStorage.findByArtifactId
      → ArtifactService.updateLinkCounts
      → Mapping von Links, Artefakten und Typen in die Antwort
  → artifactCacheStore / linkCacheStore aktualisieren
  → Highlighting und Aufklappen verknüpfter Container
```

Backend-Quellen jeweils unter `server/`:

- `com.yakindu.traceability.web.server.api.rest/src/main/java/com/yakindu/traceability/web/server/api/rest/links/ArtifactLinksResource.java`
- `com.yakindu.traceability.web.server.core/src/main/java/com/yakindu/traceability/web/server/core/links/LinkService.java`
- Speicherimplementierungen unter `com.yakindu.traceability.web.server.persistence.jpa/`
  und `com.yakindu.traceability.web.server.persistence.arangodb/`.

Für die UI müssen mindestens folgende Varianten getrennt erfassbar sein:

| Bedingung | Aussage über diesen Ladezweig |
|---|---|
| Artefakt bereits im Adjazenz-Cache | Coordinator kehrt vor dem Service-Aufruf zurück. |
| Cache leer, Antwort enthält Artefakte | Links-Request und Cache-Aktualisierung sind vorgesehen. |
| Antwort enthält keine Artefakte | Client kann zusätzlich `getArtifact(...)` aufrufen (`ArtifactService.rest.impl.ts:62`). |
| Auswahl/Route ändern sich | `register.ts:350` und `:370` synchronisieren Auswahl und Route mit Gleichheitsprüfungen. |
| Backend-Profil unterscheidet sich | Storage-Interface muss der tatsächlich aktiven Implementierung zugeordnet werden. |

Das sind keine behaupteten Request-Gesamtzahlen pro Klick. URL-Watcher,
Interceptors, Cache-Bedingungen, parallele Auswahl, `latest`-Snapshot-Auflösung
und DB-Lazy-Loading benötigen weitere Analyse bzw. Messung.

## Repoübergreifende Analyse und Laufzeit

Ein Workspace registriert beide Repositories mit stabiler `repoId`, lokaler
Wurzel und Revision. Lokale absolute Pfade gehören in lokale Konfiguration;
teilbare Modelle verwenden repo-relative Quellen. APIs bekommen servicebezogene
Vertragsidentitäten: HTTP-Methode + normalisierte Route + Zielservice, bei Bedarf
API-Version und Content-Type. URL-Host allein genügt nicht. API-Gateway-Rewrites
und `latest`-Varianten werden explizit abgebildet oder als ungeklärt markiert.

Sprach-/Frameworkadapter liefern Fakten und Abdeckung, keine fertigen Diagramme:

- TypeScript: Symbolauflösung, Imports, Call-Sites, Source-Spans.
- Vue/Pinia: Templates/Ereignisse, Composables, Store-Reads/Writes, Watcher und
  Router-Übergänge. Ein Import ist weder Funktionsaufruf noch Laufzeitnachweis.
- Axios: Methoden, Routenvorlagen, Parameter und auflösbare Service-Ziele.
- Java/Spring: Klassen/Methoden, Request-Mappings, Dependency Injection,
  Profilbedingungen, Service-/Storage-Verbindungen und Query-Kandidaten.
- Frameworkdynamik, Reflection oder unaufgelöste DI-Ziele bleiben sichtbar offen.

Für einen konkreten Klick verwenden wir korrelierte Laufzeitbelege.
[OpenTelemetry Context Propagation](https://opentelemetry.io/docs/concepts/context-propagation/)
verbindet Spans über Prozess- und Netzwerkgrenzen. Vorschlag: ausgewählte
UI-Aktion als Root-Span, Weitergabe über HTTP, Backend- und Datenbank-Spans;
interne Watcher/Store-Schritte gezielt instrumentieren, soweit für die Frage nötig.
Automatische HTTP-Instrumentierung zeichnet nicht sämtliche Vue-Funktionen auf.

Spans werden über Service, Build/Commit und Quellzuordnungen mit dem Codegraphen
verbunden. Asynchrone Fortsetzungen brauchen Parent-Bezüge oder Span-Links;
Zeitnähe allein beweist keine Ursache. Fehlende Instrumentierung unterbricht die
belegte Kette sichtbar. Datenbanktreiber-Spans zeigen tatsächliche DB-Operationen;
ein Repository-Methodenaufruf ist keine verlässliche Query-Zählung.

Zunächst importierte Trace-Fixtures und ein begrenzter lokaler Diagnoseablauf;
danach Integration vorhandener Telemetrie. Architektur-JSON bleibt git-fähig,
große Trace-Daten liegen separat lokal oder in einem vorhandenen Trace-Backend.
Keine Graphdatenbank oder eigene Telemetrieplattform als Voraussetzung.

Für produktive Trace-Daten gelten vor Beginn einer kontrollierten Aufzeichnung
verbindliche Schutzregeln: Zugriff ist authentifiziert, rollenbasiert und auf die
für Diagnose nötigen Personen sowie Felder beschränkt; sensible Felder werden
vor Speicherung oder Export nach einer versionierten Allowlist redigiert. Jede
Aufzeichnung erhält eine dokumentierte maximale Aufbewahrungsdauer und einen
prüfbaren Löschpfad einschließlich abgeleiteter Exporte und Backups, soweit diese
unter der Kontrolle des Systems liegen. Tokens, Zugangsdaten und Nutzerinhalte
werden weder in Architektur-JSON noch in Trace-Daten übernommen. Architektur-
JSON bleibt versionierbar; Trace-Daten, Zugriffskontrollen und Löschprotokolle
bleiben separat gespeichert.

Request-Zahlen unterscheiden Beobachtung pro Aktion, Zeitfenster, Cache-Zustand,
Umgebung und Sampling. [OpenTelemetry Sampling](https://opentelemetry.io/docs/concepts/sampling/)
reduziert die aufgezeichneten Traces: Ein gesampelter Ausschnitt darf nicht als
vollständige Gesamtzählung ausgegeben werden. Für den ersten Diagnosefall eine
kontrollierte vollständig erfasste Aktion anstreben; Exportverluste bleiben möglich.

Loops: statische Zyklen zunächst als mögliche Rückkopplung markieren. Laufzeit
zeigt Wiederholung, Frequenz, Auslöser und Abbruch. Absicht ergibt sich erst aus
Regeln und Kontext: Polling, Retry, Pagination und Batch sind legitime Muster.
Regelbeispiel für einen später gemeinsam festgelegten SOLL-Vertrag: „Bei warmem
Adjazenz-Cache kein erneutes Laden desselben Artefakts im unveränderten Kontext“.
Verletzte Regel, statistische Auffälligkeit und KI-Verdacht sind getrennte Befunde.
Trace-Fixtures enthalten keine Tokens, Nutzerinhalte oder rohen SQL-Parameter.

## KI als bedienbarer Zugang zum Modell

„Zeige, was beim Auswählen eines Artefakts passiert“ führt zu einer strukturierten
Abfrage mit Einstiegspunkt, Scope, Relationstypen, Tiefe und Evidenzmodus. Ergebnis
ist eine fokussierte Ansicht plus Erklärung mit anklickbaren Dateien, Zeilen,
Dokumentstellen oder Spans. Die Abfrage lässt sich ohne Chat korrigieren und
als Szenarioansicht speichern.

Die KI kann auch „nur Backend“, „woher kommt dieser Request?“, „welcher Watcher
schreibt den Store erneut?“ oder „vergleiche mit SOLL“ auf dieselbe Auswahl anwenden.
Bei fehlenden Traces sagt sie, welche Häufigkeit unbekannt ist. KI-Aussagen dürfen
Extraktionslücken nicht zu sicheren Kanten oder Driftverletzungen umdeuten.

Vorgeschlagene gemeinsame Read-Schnittstelle für UI und MCP:
`query_view`, `find_paths`, `get_callers`, `get_callees`, `compare_states`,
`get_evidence`, später `query_traces`. Abfragen sind begrenzt und abbrechbar.
Mutation bleibt beim vorhandenen Designprinzip `propose_patch` mit Basisrevision,
Vorschau und Undo. Kein separater KI-Graph und keine parallele Wahrheit im Chat.

## Sprachübergreifendes Produktziel

Auf ausdrücklichen Nutzerwunsch gilt das gesamte Zielbild einschließlich
SOLL/PLAN/IST, Laufzeitprojektion, Zustandshistorie und späterem Debugging für
unterschiedliche Programmiersprachen. C#, C++, Python und Java sind explizite
Zielsprachen neben JavaScript/TypeScript. Weitere Sprachen sollen durch Adapter
ergänzbar sein. ANALYZE bleibt erster Akzeptanzfall, begrenzt aber weder Kernmodell
noch Benutzeroberfläche auf Vue, Pinia, Browser oder JVM.

Das ersetzt die frühere Beschränkung auf Python/JS/TS/Java als langfristigen
Produktscope. Lieferung bleibt schrittweise: „beliebige Sprache integrierbar“ ist
ein Architekturziel, keine Behauptung sofortiger vollständiger Unterstützung
aller Sprachen und Laufzeiten. Bestehende Vocabulary-Packs beschreiben Begriffe;
sie sind kein Nachweis eines funktionierenden Extraktors oder Debuggers.

### Vier voneinander unabhängige Adapterfähigkeiten

| Fähigkeit | Gemeinsamer Vertrag | Sprach-/Runtime-spezifischer Teil |
|---|---|---|
| Struktur und Semantik | Entitäten, SourceRefs, Imports, Aufrufkandidaten, Evidenz | Parser, Compiler-/Projektinformationen, optional Language Server; Auflösung von Symbolen, Vererbung und dynamischen Zielen |
| Beobachtete Operationen | Spans, Ereignisse, Ursache, Service-/Buildidentität | OpenTelemetry-SDK, unterstützte Instrumentierung und Protokollübergänge |
| Zustandsänderungen | Checkpoints, Deltas, betroffene Entität, Ursache, Abdeckung | Framework-Hooks, Runtime-Instrumentierung oder explizite Messpunkte; Pinia ist ein Adapterbeispiel |
| Prozess-Debugging | Sitzung, Threads, Stack, Breakpoints, Variablen, Schritte | Vorhandene Debug Adapter oder gezielte Runtime-Bridges |

Dateibaum, Architekturentwurf, Vergleichsoberfläche, C4-Aggregation und KI-Abfragen
bleiben gemeinsam. Sprachspezifische Typen/Attribute bleiben als Erweiterungen
erhalten; C++-Templates oder Python-Dynamik werden nicht in ein Java-Klassenmodell
gezwungen. Ein Sprachadapter kann ohne Trace-Support nützlich sein, Trace-Import
ohne vollständigen Codeadapter ebenso. Unzugeordnete Spans bleiben sichtbar.

[OpenTelemetry](https://opentelemetry.io/docs/languages/) bietet SDKs unter anderem
für .NET, C++, Python und Java. Das gemeinsame Trace-Modell ermöglicht die
Darstellung unterschiedlicher Stacks; automatische Instrumentierung, unterstützte
Bibliotheken und Detailtiefe müssen pro Runtime/Version geprüft werden.
Es gibt dadurch keine automatische Aufzeichnung sämtlicher Funktionen oder
Speicheränderungen. Ein Trace-SDK ersetzt keinen State-Recorder.

Für echte Breakpoints bevorzugt eine gemeinsame Integration des
[Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/overview)
prüfen. Das Protokoll trennt Debugger-Oberfläche von sprachspezifischem Debugger.
Adapterverfügbarkeit, Lizenz, Plattformen und optionale Fähigkeiten vor Auswahl
prüfen; DAP garantiert weder Zustandsaufzeichnung noch Rückwärtsausführung oder
einen gemeinsamen Halt aller beteiligten Prozesse. Browser-/JVM-Bridges aus
Stufe 6 sind ergänzende Integrationsoptionen, nicht die allgemeine Kernabstraktion.

Für Codeinformationen können vorhandene
[Language Server](https://microsoft.github.io/language-server-protocol/overviews/lsp/overview/)
ergänzend eingesetzt werden. Fähigkeiten pro Server aushandeln; LSP nicht als
vollständigen, dauerhaften oder repoübergreifenden Callgraph behandeln. Compiler-
und Buildkonfiguration ist besonders bei nativen/kompilierten Projekten Teil der
Analyse: Include-Pfade, bedingte Übersetzung, generierter Code und Debugsymbole
beeinflussen, welcher Code zu welcher ausgeführten Version gehört.

### Adapterverträge und sichtbare Abdeckung

Eine Registry entdeckt versionierte Adapter und ihre Fähigkeiten unabhängig von
Views. Vorschlag: `StaticAnalysisAdapter`, `RuntimeObservationAdapter`,
`StateCaptureAdapter`, `DebugSessionAdapter`; konkrete APIs in einem eigenen
Umsetzungsplan festlegen. Sprachpakete und Framework-Erweiterungen kombinieren,
statt jede Sprache-Framework-Kombination als vollständigen Spezialfall zu bauen.
Stufen 1–3 führen zumindest capability-/providerbezogene Metadaten ein; noch kein
Plugin-Marktplatz und keine beliebige Codeausführung aus analysierten Repositories.

Die UI zeigt je Scope und Sitzung Fähigkeiten: Dateien sichtbar, Symbole erkannt,
Aufrufe teilweise aufgelöst, Traces verbunden, Zustandsfelder erfasst, Breakpoints
verfügbar. Fehler, fehlende Adapter und nicht unterstützte Konstrukte ergeben
Abdeckungsdiagnosen. Nie ein einzelnes irreführendes Label „Sprache unterstützt“.

Alle Adapter liefern dieselben Referenzen/Events und durchlaufen Vertragstests:
Quellpositionen, stabile Identität im Snapshot, fehlende Ziele, Teilabdeckung,
Abbruch, Diagnosen und Versionswechsel. Kernprojektion/Matching muss mit neutralen
Fixtures ohne implizite TypeScript-/Pinia-/JVM-Annahmen funktionieren.

### Lieferung und zusätzlicher Akzeptanzfall

1. ANALYZE vertikal erschließen, dabei die gemeinsamen Verträge verwenden.
2. Spätestens vor Stabilisierung der Adapter-API einen kleinen zweiten Stack
   als Gegenprobe verwenden, vorzugsweise Python oder C#; Auswahl nach verfügbarem
   Beispielprojekt. Sprachunabhängigkeit praktisch testen, nicht nur behaupten.
3. C#, C++ und Python als eigene Lieferpakete konkretisieren; je Paket getrennte
   Abnahme für Codeanalyse, Traces, State-Erfassung und Breakpoints. Keine pauschale
   Zeit-/Vollständigkeitszusage für alle vier Fähigkeiten gleichzeitig.
4. Gemischten Ablauf als Fixture abnehmen, beispielsweise TypeScript → Java →
   Python → C# und optional ein C++-Dienst. Gemeinsame IST-Ansicht und Navigation;
   Runtime-Zuordnung, Servicegrenzen und Abdeckungsunterschiede bleiben erkennbar.

Neben HTTP auch Messaging, RPC und Aufrufe nativer Bibliotheken vorsehen.
Innerhalb eines Prozesses können mehrere Sprachen beteiligt sein; Sprache,
Repository und Service sind deshalb getrennte Eigenschaften. Eine FFI-Grenze
oder verlorener Trace-Kontext braucht eine explizite Brücke bzw. sichtbare Lücke.

## Technische Trennung

```text
Dateisystem / Sprache / Framework / Speckit / Trace-Import
                   ↓ Fakten mit Herkunft und Abdeckung
         Snapshot + Identität + Zuordnungen
                   ↓
         Projektions- und Vergleichsfunktionen
                   ↓
      Baum | Gruppengraph | Sequenz | Tabelle | Inspector
                   ↑
         identische Abfrageschnittstelle für UI und KI
```

Benötigte Verträge, schrittweise ergänzt:

- `SourceRef`: repoId, `buildId`, relativer Pfad, Symbol, optionale Quellspanne,
  Revision. `buildId` identifiziert das tatsächlich gebaute bzw. ausgeführte
  Artefakt unveränderlich; ein gleicher Commit mit anderem Build ist damit eine
  andere Quell-/Laufzeitzuordnung.
- `Snapshot`: Stand, Revisionen je Repo, Arbeitsbaum-Digests, Erzeugungszeit,
  `buildId` je ausgeführtem Artefakt, Adapterversionen und Abdeckungsdiagnosen.
- `EntityRef`: kanonischer Schlüssel `(repoId, snapshotId, localNodeId)`;
  getrennt davon dauerhafte
  fachliche Identität und versionierte Zuordnungen mit Herkunft/Bestätigung.
- `RelationEvidence`: Code/Vertrag/Beobachtung/Vorschlag, Fundstelle und Bedingungen.
- `ViewDefinition`: Perspektive, Fokus, Filter, Gruppierung, sichtbare Relationen.
- `Scenario`: Trigger, Vorbedingungen, Erwartungen und zugeordnete Durchläufe.
- `RuntimeEvidence`: `buildId`, `sessionId`, `correlationKey`, RuntimeEvent-
  Referenzen, SourceRefs und Abdeckungsstatus.
- `Recording` und `DebugSession`: `buildId`, `snapshotId`, `sessionId` bzw.
  `correlationKey`, damit Aufzeichnungen und Debugger-Stopps nur mit dem
  tatsächlich ausgeführten Build verglichen oder verknüpft werden.

`buildId` wird bei Zuordnung, Vergleich und Anzeige neben Repository, Commit und
Snapshot geprüft. Fehlt die Build-Identität oder stimmt sie nicht überein, bleibt
die Evidenz als nicht eindeutig bzw. Build-Mismatch sichtbar und wird nicht still
dem lokalen Quellstand zugeschrieben.

Bestehende sichere Node-ID-Regel nicht beiläufig aufweiten. Zusammengesetzte
Repo-/Snapshot-Referenzen außerhalb des bestehenden lokalen ID-Felds führen oder
eine explizite Migration planen. `NodeSchema.catchall` allein ist keine belastbare
Validierung dieser Verträge; neue persistierte Daten bekommen eigene Zod-Schemas.
Der kanonische `EntityRef`-Schlüssel gilt für Graphknoten und -kanten, Auswahl,
Caches sowie persistierte Zuordnungen. Er wird als strukturierter Vertrag geführt
und nicht durch eine beiläufig erweiterte lokale Node-ID ersetzt.

Projektionsreihenfolge: Scope → Relationen/Fokus → Gruppierung → sichtbare
Kanten/Restindikatoren → Layout. Auswahl ändert kein Layout; ein expliziter
Layoutbefehl darf es ändern. Veraltete asynchrone Ergebnisse werden verworfen.
Später inkrementelle Extraktion, lazy Dateibaum, Index und Worker auf Grundlage
gemessener Engpässe. Keine vollständige Neu-Extraktion für einen UI-Filter.

## Umsetzung und Abnahme

### Stufe 1 — Explorer, Auswahl, Dateibaum und fokussierte Imports

Aufwand M. Sofort nützlich mit dem bestehenden IST; noch kein Versprechen eines
vollständigen Vue-/Java-Callgraphs. Architekturgruppen zunächst Ordner oder explizite
Zuordnungen, nicht angeblich automatisch erkannte fachliche Komponenten.

In scope für diesen ersten Umsetzungsschnitt:

- `src/extractors/typescript/extract-source.ts`: `path`, `qualifiedName` und
  Quellspannen ergänzen; stabile bisherige IDs erhalten.
- `src/extractors/typescript/extract.ts`: Datei-Symbol-`contains`-Kanten ergänzen.
- Neu `src/core/source-ref.ts`, `src/core/view-query.ts`, `src/core/project-view.ts`
  und entsprechende Exports in `src/core/index.ts`.
- Neu `frontend/server/utils/files.ts`, `frontend/server/api/files.get.ts`:
  sprachunabhängige Metadatenliste für Dateien/Ordner, Root-Begrenzung,
  Ausschlüsse dokumentieren, Symlinks nicht unkontrolliert verfolgen.
- Neu `frontend/components/editor/` mit Shell, Explorer, Toolbar, Inspector und
  Graph-Perspektive; `frontend/pages/index.vue` als Komposition dieser Teile.
- Neu `frontend/composables/useEditorViewState.ts`; vorhandene
  `useElkLayout.ts` und `elk-adapter.ts` anbinden/anpassen.
- Neue Tests unter `tests/core/`, `tests/frontend/`, vorhandene Extraktortests
  erweitern. Änderungen am Modell nur additiv und rückwärtskompatibel.

Schritte und Gates:

1. SourceRef und Projektionsvertrag mit Abdeckung für ein einzelnes Repo
   einführen. Testfixture mit gleichnamigen Symbolen in verschiedenen Dateien.
   `pnpm exec vitest run tests/core` → alle Tests grün, Identitäten nicht vermischt.
2. Extraktion um Verortung und Containment ergänzen, allgemeine Dateiliste
   ergänzen. `.vue`, `.java`, JSON etc. sind im Baum sichtbar, auch wenn ihre
   Semantik noch nicht analysiert wird. Unsupportierte Analyse sichtbar markieren.
   `pnpm exec vitest run tests/extractors/typescript tests/frontend/files-handler.test.ts`
   → alte IDs unverändert, Pfade korrekt, Traversal-/Symlink-Fixtures abgefangen.
3. Reine Projektion implementieren: Ordneraggregation, Richtung/Tiefe, Kantenfilter,
   stabile Reihenfolge, Maximalgröße mit Restindikator; Rohmodell bleibt unverändert.
   `pnpm exec vitest run tests/core/project-view.test.ts` → Fixtures zeigen exakt
   erwartete sichtbare Knoten, Sammelkanten und Restzahlen.
4. Shell und synchronisierte Auswahl anbinden. UI-Zustand unabhängig vom Modell;
   Suche, Fokus, Mehrfachauswahl und Reset. ELK nur auf sichtbare Projektion anwenden;
   veraltete Layoutantworten verwerfen. `pnpm typecheck` und
   `pnpm exec vitest run tests/frontend` → exit 0.
5. `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` → exit 0. Manuelle
   Abnahme über `pnpm specifyr editor /home/haex/Projekte/analyze-frontend`:
   Dateibaum zeigt Vue-Dateien, Symbolsuche fokussiert, Inspector zeigt Quelle,
   Tiefenfilter begrenzt Graph, Auswahl verschiebt keine anderen Knoten,
   Zurück stellt den vorherigen Fokus wieder her. Tastatur und leere Filter prüfen.

Tests folgen `tests/frontend/elk-adapter.test.ts`: reine Funktionen mit
`describe/it/expect`, Fixtures statt echter Nachbarrepositories. Handler-Tests
folgen `tests/frontend/ist-handler.test.ts`. UI-Verhalten zusätzlich manuell
prüfen; der vorhandene Testbestand belegt noch keine Browserinteraktionen.
Ein Browser-Testwerkzeug ist bei Einführung separat festzulegen.

### Stufe 2 — SOLL als nutzbarer Entwurfsraum

Aufwand M–L. Virtueller Dateibaum, Architekturzuordnungen, Beziehungen, Szenarien,
Commands/Undo, Speicherung von Ansichten und Patches. Auf bestehenden SOLL-Storage
und den Command-Entwurf aufsetzen. Geplante Bereiche: `src/core/commands/`,
`src/storage/`, `frontend/components/editor/`, Schreib-API und Editor-State.
Abnahme: Modul entwerfen, Store und View zu Dateien zuordnen, speichern/laden,
Verschieben rückgängig machen; Quell-Dateisystem bleibt davon unberührt.
Gate: neue Command- und Roundtrip-Tests plus sämtliche Root-Prüfungen.

### Stufe 3 — PLAN und alle drei Paarvergleiche

Aufwand L. Strukturierte Speckit-Extraktion, Snapshots, explizite Zuordnung,
Eigenschafts-/Beziehungs-/Pfaddiff, synchronisierte Zweispaltenansicht.
Geplante Bereiche: `src/extractors/plan/`, `src/core/matching/`, `src/core/drift/`,
`frontend/server/api/plan.get.ts`, `frontend/components/editor/compare/`.
Abnahme mit kontrollierter Fixture: geplanter Store an falschem IST-Pfad,
zusätzlicher Request im PLAN, fehlende Anforderung, Umbenennung, 1:n-Zuordnung,
unanalysierte Java-Datei. Letztere bleibt ungeprüft und gilt nicht als fehlend.
Gate: deterministische Matching-/Drift-/PLAN-Tests plus Root-Prüfungen.

### Stufe 4 — Statischer ANALYZE-Ablauf über beide Repositories

Aufwand L. Workspace-Konfiguration; gezielte Adapter für Vue/Pinia/Axios und
Java/Spring; API-Verknüpfung und Sequenzprojektion. Java nicht hinter allgemeiner
Python-Unterstützung einplanen, weil der gewählte Referenzfall Java benötigt.
Geplante Bereiche: `src/workspace/`, `src/extractors/vue/`,
`src/extractors/java/`, `src/extractors/contracts/`, Ablaufprojektion und UI.
Abnahme: oben belegter Auswahlzweig einschließlich Watcher, Cache-Bedingung,
HTTP-Grenze und Storage-Interface; aktive Implementierung nur mit Profilbeleg.
Anonymisierte minimale Zwei-Repo-Fixture in specifyr; keine Tests abhängig von
privaten sibling checkouts. Die Fixture enthält absichtlich identische relative
Pfade und Symbole in beiden Repositories und prüft vor dem Gate, dass sie über
`(repoId, snapshotId, localNodeId)` getrennt bleiben. Gate: Adapter-/Contract-/
Szenario-Tests plus Root-Prüfungen.

### Stufe 5 — Beobachtete Abläufe, Häufigkeiten und Regelverletzungen

Aufwand L, nach Instrumentierungs-Spike. Trace-Import, Quellzuordnung,
Zeitachse, Request-/Query-Zählung und erklärbare Auffälligkeiten.
Geplante specifyr-Bereiche: `src/observations/`, `src/core/scenarios/`, Trace-API
und Ablauf-UI. Änderungen an ANALYZE wären ein eigener begrenzter Folgeauftrag.
Abnahmefixtures: Cache kalt/warm, zusätzliches Artefakt-Nachladen, wiederholte
Auswahl, explizit erlaubter Retry, unzulässige Wiederholung, verlorener Kontext,
unvollständige Messung und abweichende Buildrevision. Vor einer kontrollierten
Aufzeichnung im echten System müssen die Schutzregeln für Zugriff, Redaction,
Aufbewahrung und Löschung dokumentiert, technisch konfiguriert und mit einem
Löschtest nachgewiesen sein. Architektur-JSON und Trace-Speicher werden dabei
getrennt geprüft. Gate: Import-/Korrelations-/Regeltests plus Root-Prüfungen
und dieses Datenschutz-Gate. Kein Live-System wurde in dieser Planung gestartet.


## Stufen 5a, 5b und 6: eigene Pläne

Die Ausbaustufen zur echten Ausführung in der IST-Ansicht werden nicht mehr
hier ausgearbeitet, sondern jeweils als eigener Umsetzungsplan geführt. Das
gemeinsame Zielbild und die Abgrenzung zum Vergleich SOLL/PLAN/IST bleiben
Teil von Plan 001; alles Weitere folgt gestaffelt mit expliziten
Go/No-Go-Gates zwischen den Stufen.

| Stufe | Fähigkeit | Plan |
|---|---|---|
| 5a Live-Beobachtung | Ein echter Klick aktiviert IST-Bausteine; Requests, ausgewählte Actions/State-Deltas und Backend-Spans erscheinen. | [Plan 002](002-live-observation-execution-tracing.md) |
| 5b Aufzeichnung untersuchen | Zeitleiste, vor/zurück, rekonstruierter erfasster Zustand, Stopps bei Abweichungen, Vergleich zweier Durchläufe. | [Plan 003](003-recording-exploration.md) |
| 6 Prozess-Debugging | An Quellstellen anhalten, Variablen inspizieren und echte Ausführung fortsetzen; Backend-Debugging aus dem Browserklick heraus. | [Plan 004](004-process-debugging.md) |

Zielbild kurz: IST ist die Ausführungsansicht; SOLL und PLAN sind
Vergleichsstände. Der Debugger arbeitet ausschließlich auf IST der
tatsächlich ausgeführten Version. Ein SOLL- oder PLAN-Modell ist keine
Voraussetzung. Ein optionaler Vergleich verändert weder den
IST-Ausführungspunkt noch gesetzte Breakpoints.

Reihenfolge und Bedingungen: 5a → 5b nur nach bestandenem Gate in Plan 002;
5b → 6 nur nach bestandenem Spike-Gate in Plan 003. Ein negativer Spike
stoppt Stufe 6 dieser Iteration und wird zurückgestellt, nicht durch eine
schwächere Ersatzlösung ausgetauscht.

## Verifikation, Grenzen und Pflege

Die Befehle `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` stammen aus
`package.json` und `.github/workflows/ci.yml`. Sie sind Gates für die Umsetzung;
bei dieser reinen Planung wurden keine Anwendungstests oder Builds ausgeführt.
Node-Version aus `.nvmrc`, pnpm aus `packageManager` verwenden. Keine Commits,
Pushes oder Änderungen in den Referenzrepos sind Bestandteil dieses Plans.

Vor Umsetzung: `git diff --stat 43a519b..HEAD -- src frontend tests package.json`
und den aktuellen Arbeitsbaum prüfen. Abweichende Codestellen zuerst mit dem
aktuellen Stand abgleichen; vorhandene Änderungen nicht überschreiben.

Stufe 1 ist fertig, wenn SourceRefs und Containment getestet sind, Dateien auch
ohne Sprachadapter navigierbar sind, Filter vor Layout wirken, Auswahl/Inspector
synchron bleiben, alle Root-Gates grün sind und die manuelle Abnahme protokolliert
ist. Für Stufen 2–5 vor Implementierung jeweils einen eigenen detaillierten
Umsetzungsplan anhand dieses Zielbilds und des dann aktuellen Codes erstellen.

Anhalten und berichten, wenn die erste Stufe eine inkompatible ID-/Speichermigration
oder Änderungen außerhalb ihres Scopes benötigt; wenn Checks nach zwei begründeten
Korrekturversuchen scheitern; wenn Zuordnungen nur geraten werden können. Unbekannte
Beziehungen explizit darstellen, statt sie als vermeintlich sicher zu ergänzen.

Pflege: Frameworkadapter mit Version/Abdeckung kennzeichnen; neue Relationen in
Projektion und Vergleich prüfen; Layoutkoordinaten nicht als Architekturdrift
werten; Snapshots bei Quelländerungen als veraltet markieren. Trace-Versionen und
Code-Revisionen zusammenhalten. Das erste reale Szenario bleibt ein dauerhafter
Akzeptanzfall für zukünftige Adapter- und UX-Änderungen.
