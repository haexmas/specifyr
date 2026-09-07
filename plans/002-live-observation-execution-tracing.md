# Plan 002: Echte Ausführung in der IST-Ansicht verfolgen (Stufe 5a)

- Status: DRAFT — Produkt- und Umsetzungsvorschlag für Stufe 5a.
- Priorität: P2; Aufwand: L; Risiko: HIGH (Browser-Instrumentierung experimentell,
  Korrelation Frontend↔Backend ohne globalen Zustand ist nicht trivial).
- Basis: [Plan 001 „Perspektiven und Vergleich"](001-editor-perspectives-and-state-comparison.md);
  gemeinsames Modell, SourceRefs, IST-Extraktion und C4-Aggregation stammen dort her.
- Referenzfall: „Artefakt-Auswahl in ANALYZE" über analyze-frontend/analyze-backend.

## Ziel und Erfolgskriterium

Ein echter Klick im ANALYZE-Browser aktiviert die zugehörigen IST-Bausteine in
specifyr. Requests, ausgewählte Pinia-Actions/State-Deltas und Backend-Spans
erscheinen als korrelierte Ereignisse an ihren IST-Knoten und -Kanten. Späte
Ereignisse werden nachgetragen; nicht zuordenbare Ereignisse bleiben sichtbar.

Erster sichtbarer Erfolg: ein echter Klick, ein sichtbarer Request, ein
Store-Feld vor/nach der Änderung, ein Backend-Span am zugeordneten IST-Baustein
und mindestens ein Eintrag „nicht zugeordnet", der belegt, dass Lücken benannt
werden statt still zu verschwinden.

## Zielnutzer und Nichtziel

Zielnutzer ist der Entwickler, der die eigene Anwendung in einer lokalen
Entwicklungsumgebung debuggt. QA-Reproduktion in Testumgebungen und
Architektursichtung ohne Codezugriff sind nicht der Maßstab dieses Plans;
sie dürfen später eigene Anforderungen einbringen.

Nicht das Ziel: eine vollständige Historie jeder Zuweisung, ein synthetisches
Gesamt-Timing paralleler Vorgänge oder Rückwärtsnavigation. Aufzeichnungs-
untersuchung ist [Plan 003](003-recording-exploration.md).

## IST ist die Ausführungsansicht; SOLL und PLAN sind Vergleichsstände

SOLL ist der Entwurf des Nutzers, PLAN die aus Speckit abgeleitete
Ausarbeitung, IST die aus Implementierung und Laufzeitbelegen gewonnene
Sicht. Live-Beobachtung arbeitet ausschließlich auf IST der tatsächlich
ausgeführten Version. Ein SOLL- oder PLAN-Modell und eine SOLL↔IST-Zuordnung
sind keine Voraussetzung. Aufzeichnungen referenzieren Code-Builds und
IST-Snapshot bzw. Quellzuordnung; Abweichungen zum lokalen Checkout werden
sichtbar markiert.

Optional öffnet der Nutzer SOLL oder PLAN daneben und vergleicht erwartetes
mit beobachtetem Verhalten. Nur dieser Vergleich benötigt die versionierten
Zuordnungen. Eine Änderung des Entwurfs verändert weder die laufende
Beobachtung noch vergangene Ausführungen.

- Bekannte Schritte aktivieren ihre IST-Bausteine; Entwurfsmodelle bleiben unverändert.
- Nicht zugeordnete IST-Schritte erscheinen als temporäre Knoten oder in einer
  sichtbaren Liste „nicht zugeordnet". Sie werden nicht ausgeblendet.
- Unerwartete, aber belegte Verbindungen können als zusätzliche Kanten erscheinen.
- Ein erwarteter Schritt bleibt „nicht beobachtet", bis Szenariobedingungen und
  Messabdeckung eine weitergehende Bewertung erlauben.
- Im optionalen Vergleich können SOLL-Regeln Abweichungen markieren, etwa
  erneutes Laden trotz warmem Cache.

## Interaktion

1. In IST die Perspektive und den Fokus „Artefakt-Auswahl" öffnen. Beobachtung
   aktivieren und die richtige Browser-/Backend-Diagnosesitzung verbinden.
2. „Nächste Artefakt-Auswahl aufzeichnen" aktivieren und im ANALYZE-Browser
   klicken. Die Aktion bekommt eine eigene Identität; andere Tabs und
   überlappende Klicks bleiben getrennt. Langlaufende Folgevorgänge werden
   explizit verknüpft.
3. Beobachtete Schritte erscheinen auf zugeordneten IST-Knoten und Kanten mit
   Aktivitätsmarkierung, Dauer, Aufrufzahl und Status. Auf hoher C4-Stufe
   aggregiert ein Modul seine internen Schritte; Aufklappen zeigt
   instrumentierte Details.
4. Live-Modus folgt neuen Ereignissen. Pausieren friert nur die Darstellung
   ein, während die Anwendung weiterläuft. Späte Ereignisse und Messlücken
   werden sichtbar nachgetragen; keine künstlich sichere Gesamtreihenfolge
   paralleler Vorgänge. Kausalbezüge sind wichtiger als Zeitstempelsortierung.

## Aufzeichnung und Instrumentierung

OpenTelemetry liefert Traces/Spans und Ereignisse als Grundlage, aber keine
automatische Historie jeder Funktion, lokalen Variablen oder Zustandsänderung.
Der [Browser-Leitfaden](https://opentelemetry.io/docs/languages/js/getting-started/browser/)
kennzeichnet Browser-Instrumentierung derzeit als experimentell. Vor breiter
Integration deshalb einen engen Vue/Pinia/Axios-Spike durchführen.

Pinia bietet Beobachtung von [Actions](https://pinia.vuejs.org/core-concepts/actions.html#subscribing-to-actions)
und [State-Änderungen](https://pinia.vuejs.org/core-concepts/state.html#subscribing-to-the-state).
Ein Entwicklungs-Plugin nutzt diese Schnittstellen und zeichnet für ausgewählte
Stores einen Startzustand sowie geordnete Deltas/Checkpoints auf. Subscriptions
bündeln Änderungen; sie beweisen nicht jede einzelne Zuweisung oder deren
Verursacher. Für Watcher, lokale Vue-Refs, JointJS-Zustand und detaillierte
Funktionsschritte braucht es zusätzliche gezielte Hooks oder Instrumentierung
beim Build. Keine Vollständigkeit versprechen, wo nur Store- oder HTTP-Grenzen
instrumentiert sind.

Ein `RuntimeEvent` trägt sessionId, actionId, eventId, kind, traceId/spanId
(falls vorhanden), Ursache/Links, serviceId, SourceRef, lokale Sequenznummer,
Zeit und StateDeltaRef. Umfang und Ursache können ausdrücklich unbekannt sein.
Gleichzeitige Actions dürfen nicht über eine globale „aktuelle Aktion"-Variable
vermischt werden. Kontext über await, Timer, Watcher und HTTP gezielt testen;
bei fehlendem Beleg keine Zuordnung nur aus zeitlicher Nähe.

State-Aufzeichnung: freigegebene Felder, Serialisierungsregeln, Größenlimits,
Redaktion vor Export, unveränderliche Kopien statt Referenzen auf lebende
Objekte. Keine vollständigen Store-Kopien bei jedem Ereignis. Fehlende Deltas
unterbrechen die Rekonstruktion sichtbar bis zum nächsten vollständigen
Checkpoint. DB-Spans belegen Operationen; Vorher-/Nachher-Werte in der
Datenbank benötigen zusätzliche fachliche Ereignisse oder gesonderte Erfassung.

## Mindestinstrumentierung (harte Untergrenze)

Ohne die folgenden Belege liefert 5a nur ein Live-Bild mit Löchern und darf
nicht als „Live-Beobachtung" ausgeliefert werden:

- Action-/Request-Korrelation zwischen einem Klick im Frontend und dem
  ausgelösten HTTP-Vorgang, ohne globale „aktuelle Action"-Variable und ohne
  alleinige Zuordnung aus zeitlicher Nähe.
- Store-Grenze für mindestens einen Pinia-Store: Startzustand plus geordnete
  Deltas ausgewählter Felder mit stabiler Serialisierung.
- HTTP-Grenze frontendseitig: Start, Antwort, Fehler mit Verknüpfung zur
  auslösenden Action.
- Serverseitige Traces/Spans mit gemeinsamem Trace-Kontext über die
  Frontend-Backend-Grenze hinweg.
- Sichtbare Liste „nicht zugeordnet" für Ereignisse ohne IST-Bezug, ausdrücklich
  kein stilles Wegfallen.

Watcher, lokale Vue-Refs, JointJS-Zustand und detaillierte Funktionsschritte
gehören ausdrücklich nicht zu dieser Untergrenze. Wenn sie später gebraucht
werden, sind sie eigene, benannte Instrumentierungsvorhaben mit eigenem
Aufwandsposten und eigener Abnahme.

## Abnahme

- Ein echter Browserklick wird bis zu Backend-/DB-Belegen in IST dargestellt.
- Ein ausgewähltes Store-Feld ist vor/nach einer Änderung sichtbar.
- Mindestens ein unzugeordneter Schritt bleibt erhalten und ist als solcher
  markiert.
- Alle Punkte der Mindestinstrumentierung tragen im Referenzfall.
- Root-Gates grün: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Reproduzierbare Live-Abnahme protokolliert.

## Gate 5a → 5b (Bedingung für [Plan 003](003-recording-exploration.md))

Stufe 5b darf erst begonnen werden, wenn zusätzlich zu den Abnahmepunkten oben:

- Mindestens zwei überlappende Klicks bleiben in der Live-Ansicht korrekt getrennt.
- Mindestens ein spät eingetroffener Span wird sichtbar nachgetragen.
- Die Nicht-Zuordnungsliste verdeckt kein stilles Falsch-Zuordnen (durch
  eingebrachte falsche Korrelation im Test nachweisbar).
- Ein neu hinzugekommener Store im Referenzcode wird ohne Änderung am Werkzeug
  sichtbar oder ist explizit als „nicht instrumentiert" markiert.

## Vorbereitung in vorgelagerten Stufen

Aus Plan 001 werden benötigt: stabile SourceRefs, getrennte Modell-/View-/
Beobachtungszustände, Runtime↔IST-Quellzuordnung und C4-Aggregation mit
Drilldown. SOLL↔IST-Zuordnungen gehören separat zum optionalen Vergleich.
Kleine aufgezeichnete Fixtures dürfen die spätere Darstellung früh prüfbar
machen; der vollständige Debugger bleibt späterer Ausbau.
