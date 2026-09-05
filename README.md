# specifyr

`specifyr` is a local, deterministic consistency checker for specifications,
plans, ADRs, tasks, tests, and discovery graphs. It keeps natural-language
artifacts readable while giving selected normative claims executable semantics.

The project is an MVP built around one trust boundary:

> Graphify and language models may propose concepts, relations, claims, and
> rules. Only reviewed, typed claims and rule packs are authoritative inputs to
> the checker.

## What works

- A versioned Spec Model for artifacts, claims, relations, scope, lifecycle,
  provenance, and explicit closed-world declarations.
- Six data-only rule patterns: contradictory claims, stale references,
  requirement coverage, dependency cycles, unresolved references, and
  explicitly ambiguous claims.
- Numeric interval conflicts (`exactly`, `at_least`, `at_most`, `greater_than`,
  `less_than`) plus `must` versus `must_not` conflicts.
- Deterministic Speckit/ADR structure extraction, including visible
  `specifyr` JSON blocks in Markdown.
- A Graphify `graph.json` adapter that preserves confidence labels and emits
  non-authoritative candidates.
- Rule-pack assurance with conforming/violating examples and disable-rule
  mutation testing.
- A benchmark comparing the formal checker with a plain document-only
  Speckit/ADR baseline.
- JSON and human-readable findings with stable IDs and source evidence.

## Quick start

No runtime dependencies are required for the MVP.

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -e .

specifyr rules-verify
specifyr benchmark --runs 25 --format markdown
```

Check an existing formal model:

```bash
specifyr check --model path/to/model.json
```

Extract deterministic structure and visible claims from a Speckit project:

```bash
specifyr extract /path/to/project --output specifyr-out/model.json
specifyr check --model specifyr-out/model.json
```

Import Graphify candidates:

```bash
graphify update . --no-cluster
specifyr graphify-import \
  --graph graphify-out/graph.json \
  --output specifyr-out/candidates.json
```

The import does not promote candidates into the authoritative Spec Model.

## Visible formal claims

Accepted claims live beside the prose they formalize:

````markdown
- **FR-004**: Exactly one workflow must be active.

```specifyr
{"id":"example:FR-004","kind":"requirement","modality":"must",
 "polarity":"positive","subject":"example:project",
 "predicate":"example:active-workflow-count","operator":"exactly",
 "value":1,"scope":{"feature":"workflow"}}
```
````

The block is visible in rendered source review, deterministically parsed, and
inherits the artifact's lifecycle status unless it declares one explicitly.

## Benchmark result

The checked-in golden corpus contains ten cases covering semantic conflicts,
scope separation, lifecycle staleness, open-world versus closed-world
coverage, legal and illegal cycles, broken references, and ambiguity.

The current local result is in [`benchmarks/results/latest.md`](benchmarks/results/latest.md).
On the initial corpus the formal runner detects all seven labeled problems;
the document baseline misses three semantic/graph problems and produces one
false coverage finding because plain artifacts cannot declare an open-world
boundary.

This is deliberately a first benchmark, not a general claim that formal logic
always outperforms Spec Kit. The bundled baseline is a deterministic analysis
of plain Speckit/ADR artifacts. It is **not** an execution of the model-driven
`/speckit.analyze` command. See [`docs/benchmark-methodology.md`](docs/benchmark-methodology.md)
for the external-baseline protocol.

## Commands

```text
specifyr check             Check a model against a rule pack
specifyr extract           Extract Speckit/ADR structure and visible claims
specifyr graphify-import   Convert graph.json into review candidates
specifyr rules-verify      Verify rule examples and mutation sensitivity
specifyr benchmark         Compare formal and document-only runners
specifyr benchmark-export  Materialize corpus documents for external runs
```

Exit status is `0` for a conforming check, `1` for blocking findings, and `2`
for invalid input or operational errors.

## Current limits

- Exact scope matching only; subset/overlap reasoning is not implemented.
- The core evaluator supports a deliberately small rule-pattern language,
  not arbitrary Prolog or Datalog.
- Z3 is declared as an optional future backend but is not needed by the MVP.
- Graphify proposals are imported, not automatically converted to formal
  claims or activated rules.
- The benchmark corpus is curated and small.
- Markdown parsing is deterministic but intentionally narrow; it is not a
  full CommonMark semantic model.

These limits keep the trusted kernel small enough to test. The next milestone
is candidate review/promotion via a reviewable patch, followed by a bounded SMT
backend and repeated external `/speckit.analyze` benchmark runs.

## Development

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
PYTHONPATH=src python -m specifyr rules-verify
PYTHONPATH=src python -m specifyr benchmark --runs 25 --format markdown
```

