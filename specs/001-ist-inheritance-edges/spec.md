# Feature Specification: IST Inheritance Edges

**Feature Branch**: `001-ist-inheritance-edges`
**Created**: 2026-09-10
**Status**: Draft
**Input**: User description: "Slice IST Inheritance Edges. Der TypeScript-IST-Extractor emittiert aktuell nur `imports`-Kanten zwischen Modulen. Symbole (Klassen, Interfaces, Type-Aliases, Enums, Functions) haben keine Kanten untereinander — was macht die IST-Sicht wenig aussagekräftig. Diese Slice fügt zwei neue Kanten-Typen hinzu: `extends` (class extends class, interface extends interface(s)) und `implements` (class implements interface(s)). Cross-file-Auflösung nutzt die vorhandenen Import-Informationen; Same-file-Auflösung nutzt lokale Symbole. Rendering: Neighbors-Sidebar bekommt eigene Sections pro Kanten-Typ, Canvas rendert extends solid und implements dashed. `calls`-Kanten sind explizit deferred (eigener zukünftiger Slice). Diese Slice ist Voraussetzung für das folgende Slice Query-UI, das Fragen wie "wer erweitert X?" beantworten können soll."

## Clarifications

### Session 2026-09-10

- Q: How should Neighbors sidebar sections behave when a node has many entries (e.g., a base class with 50+ subclasses)? → A: All entries shown, scroll like the existing Imports/Imported-by sections; no cap, no truncation, no "show more".
- Q: When a cross-wrapper edge aggregate contains a mix of edge types (e.g., both an `imports` and an `extends` between the same two visible wrappers), how does it render on the canvas? → A: Single-type aggregates use their type's style (extends solid, implements dashed, imports current); mixed-type aggregates fall back to the imports style. The mix is discoverable via the details sidebar when the wrappers are expanded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inheritance relationships appear in the extracted model (Priority: P1)

An architect opens the IST view of a TypeScript project in the specifyr editor. Today the graph shows every file and every class/interface as a node, but the only connecting lines are file-to-file `imports`. All the class hierarchies and interface implementations that give the code its structure are invisible. After this feature ships, when a class in the codebase extends another class, or a class implements one or more interfaces, or an interface extends other interfaces, those relationships appear in the underlying model that the editor consumes.

**Why this priority**: This is the foundation. Without inheritance information present in the model, no downstream UI can display or query it. Anyone consuming the `/api/ist` endpoint immediately gets richer data even before any UI changes ship. It also unblocks a follow-up feature (Query UI) that will let users ask "who extends X?" style questions — without the data those questions are unanswerable.

**Independent Test**: Fetch the IST for a repository that contains at least one class extending another class in the same repo. Confirm the returned model contains an `extends` edge whose endpoints match the child and parent class ids, and that the previous `imports` edges are unaffected.

**Acceptance Scenarios**:

1. **Given** a repository with `class Child extends Parent {}` where `Parent` is imported from another file in the same repo, **When** the IST is extracted, **Then** the model contains one `extends` edge from the `Child` node to the `Parent` node.
2. **Given** a repository with `class Foo implements A, B {}` where `A` and `B` are two interfaces in the same repo, **When** the IST is extracted, **Then** the model contains two `implements` edges from `Foo` — one to `A`, one to `B`.
3. **Given** a repository with `interface Sub extends Base1, Base2 {}`, **When** the IST is extracted, **Then** the model contains two `extends` edges from `Sub` to the two base interfaces.
4. **Given** a class that extends a type imported from an external package (not part of the walked repo), **When** the IST is extracted, **Then** no inheritance edge is emitted (silently dropped, no error).

---

### User Story 2 - Users can traverse hierarchies from the details sidebar (Priority: P2)

An architect clicks a class node on the canvas. The details sidebar (which today lists `Imports` and `Imported by` neighbors) now also shows separate sections for what the selected class extends, what extends it, which interfaces it implements, and — if the selection is an interface — which classes implement it. Each entry in a section is clickable and navigates the selection to that neighbor, just like the existing import sections do.

**Why this priority**: This is where users first experience the value of the new data. It answers the questions "what's above/below this class in the hierarchy?" and "who else implements this interface?" through the same click-to-navigate pattern already used for imports. Ships value directly to the human at the keyboard; no query DSL needed.

**Independent Test**: With inheritance edges present in the model, click a class node in the editor. Confirm the sidebar renders an `Extends (N)` section with the parent class(es) as clickable rows, an `Extended by (N)` section on the parent when navigated to, and equivalent `Implements` / `Implemented by` sections for classes and interfaces respectively. Nodes that participate in no such relationships show no empty sections.

**Acceptance Scenarios**:

1. **Given** a class `Child extends Parent`, **When** the user clicks the `Child` node, **Then** the sidebar shows an `Extends (1)` section containing a clickable row for `Parent`.
2. **Given** the same class `Child extends Parent`, **When** the user clicks the `Parent` node, **Then** the sidebar shows an `Extended by (1)` section containing a clickable row for `Child`.
3. **Given** an interface implemented by two classes, **When** the user clicks the interface node, **Then** the sidebar shows an `Implemented by (2)` section listing both classes.
4. **Given** a node that participates in no inheritance relationships, **When** the user clicks it, **Then** the sidebar shows no inheritance-related sections (the sections are suppressed rather than shown as empty).
5. **Given** a class shown in an inheritance section, **When** the user clicks that row, **Then** the selection moves to that class and the sidebar refreshes to reflect the new selection.

---

### User Story 3 - Inheritance is visually distinguishable on the canvas (Priority: P3)

Looking at the canvas without selecting anything, the user can visually tell inheritance edges apart from import edges, and `extends` apart from `implements`. Someone scanning a large graph at a glance recognizes the shape of hierarchies without reading node labels.

**Why this priority**: Sidebar-driven navigation (Story 2) already delivers the primary value; visual differentiation is polish that makes the canvas readable at scale. It's separable because a canvas that renders all edge types with the same style is still functional — the sidebar still tells you what's what — but harder to skim.

**Independent Test**: Load a repository with at least one `extends` and one `implements` edge into the editor. Visually confirm that the two edge types render differently from each other and from the existing `imports` edges. Confirm this holds when edges cross wrapper boundaries and get aggregated (see edge cases below).

**Acceptance Scenarios**:

1. **Given** a repository with visible `extends`, `implements`, and `imports` edges on the canvas, **When** the user looks at the canvas, **Then** each edge type is visually distinguishable from the other two.
2. **Given** an `extends` edge that runs between two symbols inside the same expanded file wrapper, **When** rendered, **Then** it appears as the `extends` style.
3. **Given** an `extends` edge whose endpoints are both hidden inside a collapsed folder AND no other edge type spans the same visible wrapper pair, **When** the folder is collapsed, **Then** the aggregated cross-wrapper edge renders in the `extends` style.
4. **Given** both an `imports` and an `extends` edge span the same visible wrapper pair, **When** they aggregate, **Then** the aggregate renders in the `imports` style (mixed-type fallback); the actual mix becomes visible in the details sidebar when the wrappers are expanded.

---

### Edge Cases

- **Namespace-qualified inheritance** (`class Foo extends Bar.Baz {}`): silently drop the edge. Namespace resolution is out of scope for this feature.
- **Generic-type-argument inheritance** (`class Foo extends Base<T> {}`): resolve to `Base` (strip generics). `class Foo extends Base<Concrete>` also resolves to `Base` — the concrete type argument does not itself become a resolved relationship.
- **Aliased default-import inheritance** (`import D from "./m"; class F extends D {}`): silently drop. Default exports are not currently tracked with named symbols.
- **Inheritance from an external package** (e.g. `import { EventEmitter } from "events"`): silently drop; only in-repo targets produce edges.
- **A class extending an unknown identifier** (typo, deleted import, etc.): silently drop, no error surfaces to the user.
- **Same-file inheritance** (`class Sub extends Super {}` both in one file): resolve `Super` via same-file scope, emit the edge normally.
- **Duplicate targets** (e.g. `class Foo extends Bar implements Bar` — unusual but possible): each declared relationship is emitted at most once per `(from, to, edge-type)` triple. Same-source deduplication.
- **Class shadowing** — same-file symbol name matches an imported name: the same-file symbol wins (source-language semantics).
- **Nodes that are not classes or interfaces**: no inheritance sections appear in the sidebar for them (e.g. type-aliases, enums, functions, modules).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect `extends` relationships in class declarations (including abstract classes) — one parent per child.
- **FR-002**: The system MUST detect `extends` relationships in interface declarations — one or more parents per child.
- **FR-003**: The system MUST detect `implements` relationships in class declarations — zero or more interface targets per class.
- **FR-004**: The system MUST resolve an inheritance target that is imported into the source file to the target's own declaration in its declaring file when both files are inside the same repository being extracted.
- **FR-005**: The system MUST resolve an inheritance target that is declared in the same file as the referring class or interface.
- **FR-006**: When a target cannot be resolved by the two mechanisms above (external package, namespace-qualified access, unknown identifier), the system MUST silently drop the relationship without producing an error visible to the user.
- **FR-007**: The system MUST dedupe emitted relationships so a repeated `(source symbol, target symbol, relationship type)` triple appears at most once in the model.
- **FR-008**: The details sidebar MUST display inheritance relationships in separate sections labelled to distinguish direction (`Extends` / `Extended by`) and type (`Implements` / `Implemented by`) rather than lumping them with imports.
- **FR-009**: Each entry in an inheritance section MUST be clickable and MUST navigate the current selection to that neighbor.
- **FR-010**: An inheritance section MUST be hidden entirely when it has no entries (no "empty" or "None" placeholder for inheritance-agnostic nodes).
- **FR-010a**: An inheritance section MUST show every entry it has (no cap, no "show more", no truncation) and rely on the sidebar's existing scroll behavior for overflow — matching the current Imports / Imported-by sections.
- **FR-011**: The canvas MUST render `extends`, `implements`, and existing `imports` edges in visually distinguishable styles.
- **FR-011a**: When a cross-wrapper aggregated edge contains raw edges of a single type only, the canvas MUST render it in that type's style. When it contains raw edges of multiple types, the canvas MUST fall back to the `imports` style — the type mix is not shown on the aggregate itself and can be inspected via the details sidebar after expanding the wrappers.
- **FR-012**: The existing `imports` edges, `Imports`/`Imported by` sidebar sections, and node/wrapper/expand behavior MUST continue to work unchanged.

### Key Entities

- **Inheritance Relationship**: A directed connection between two symbol nodes in the IST model. Carries a relationship type (`extends` or `implements`), a source symbol id (the deriving class or interface), and a target symbol id (the parent class, extended interface, or implemented interface). Emitted alongside the existing module-to-module `imports` relationships as another entry in the model's edge collection.
- **Symbol Node**: An existing entity in the model. Represents a top-level class, abstract class, interface, type-alias, enum, or function in a source file. Already carries a stable id and a `type` label. Inheritance edges reference these ids as their endpoints.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of inheritance relationships whose target is same-file-local OR named-imported from another file inside the same repository appear as edges in the extracted model. Relationships whose target is out-of-scope per the Edge Cases section (namespace-qualified, default-import-aliased, external package, unknown identifier) produce no edge — by construction, not by omission.
- **SC-002**: After selecting any class or interface in the editor, a user can identify its parent(s), its children, and its interface-implementation partners (in either direction) without opening any additional tool, file, or side channel.
- **SC-003**: The set of edges produced by the extractor for a repository is stable across runs — repeated extraction of the same repository produces identical edge lists modulo ordering (verified by running the extractor twice on the same fixture in the test suite).
- **SC-004**: For the fixed Story 3 fixture used by T021, at the viewport and zoom recorded in the quickstart, every single-type `extends` aggregate uses the solid style, every single-type `implements` aggregate uses the dashed `6 4` style, every single-type `imports` aggregate retains the existing imports style, and every mixed-type aggregate uses the imports fallback style. T015 and T017 assert these mappings programmatically; the manual smoke test confirms the rendered result.

## Assumptions

- The audience is developers and architects who understand `extends` and `implements` as language-level concepts — no in-editor explanation of the terms is needed.
- Inheritance targets outside the walked repository (imports from `node_modules`) are not shown; the feature is deliberately scoped to in-repo structure, mirroring the existing scope of `imports` edges.
- `calls` relationships (function-to-function, method-to-function/method) are explicitly out of scope for this feature and are deferred to a separate future feature.
- The existing IST extraction pipeline and its symbol-id scheme are sufficient — no changes to how nodes are identified or discovered.
- The Neighbors sidebar's existing click-to-navigate pattern is the right interaction model for the new sections; no new interaction paradigm is introduced.
- Users will click into individual nodes to explore inheritance; there is no cross-repository or aggregate "show all hierarchies" view in this feature.
- No persistence of user interactions across sessions is required beyond what the editor already has.
- Extraction runtime scales linearly with file count (the algorithm is a single AST walk per file plus O(nodes + edges) resolution). Adding inheritance is expected to add no more than a small constant per class/interface, well under a second for typical (~500-file) repositories. No dedicated performance test is written for this feature; a manual timing check on a real repository stands in for it, and only a regression there would motivate adding a bench.

## Dependencies

- Depends on the existing IST extractor and its symbol-node generation for class, abstract class, and interface declarations.
- Depends on the existing import extraction, which will need to surface information about which named symbols each import binds locally (so cross-file inheritance targets can be resolved).
- Depends on the existing Neighbors sidebar structure and click-to-navigate behavior.
- Depends on the existing canvas edge rendering + edge-aggregation logic (both will need to become aware of the new edge types).

## Out of Scope (explicitly)

- `calls` edges (function-to-function, method-to-method).
- Namespace-qualified inheritance targets (`Foo.Bar`).
- Default-import-aliased inheritance targets (`import D from "./m"; class F extends D {}`).
- Resolution of generic type arguments (`extends Base<Concrete>` only resolves `Base`, not `Concrete`).
- Cross-repository inheritance (target defined outside the walked repo).
- Any new query DSL or search UI on top of the new edges — that is the separate follow-up feature "Query UI".
- Persistence of inheritance view state or preferences across editor reloads.
