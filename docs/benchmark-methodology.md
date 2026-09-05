# Benchmark methodology

## Question

Does a reviewed formal claim graph detect cross-artifact consistency problems
more reliably than plain Speckit/ADR documents alone?

## Gold corpus

`benchmarks/corpus.json` contains ten cases. Each case has:

- plain Markdown documents;
- a reviewed Spec Model;
- expected finding categories;
- expected rule IDs.

Positive and negative cases are both necessary. In particular, the corpus
contains two traps for over-eager analyzers:

- different values in disjoint scopes are not contradictory;
- missing verification under open-world semantics is unknown, not a gap.

## Bundled runners

### Formal

Runs the reviewed model through the core Rule Pack. It measures the checker,
not automatic formalization quality.

### Document baseline

Uses only mechanically visible properties of plain Speckit/ADR artifacts:

- explicit ambiguity markers;
- explicit supersession wording;
- missing Markdown link targets;
- FR identifiers not referenced outside `spec.md`.

It does not receive the formal model and does not call a language model. This
is a reproducible lower baseline, not a substitute for `/speckit.analyze`.

## Metrics

Metrics are micro-averaged over `(case, category)` labels:

- precision, recall, and F1;
- false positives and false negatives;
- mean runtime per case;
- repeat determinism;
- finding evidence coverage.

Runtime is descriptive only on this small corpus.

## External `/speckit.analyze` baseline

Export the documents:

```bash
specifyr benchmark-export --output specifyr-out/benchmark-cases
```

Run `/speckit.analyze` independently for each case without exposing the gold
labels. Normalize its findings to the six corpus categories:

```text
contradiction
stale_reference
missing_coverage
dependency_cycle
unresolved_reference
ambiguity
```

Record one run using `benchmarks/external-baseline.example.json` as the shape,
then score it:

```bash
specifyr benchmark \
  --external-baseline path/to/speckit-run.json \
  --runs 25 \
  --format markdown
```

Model-driven analysis must be repeated because outputs may vary. Report every
run, model/version, prompt or command revision, and evidence rate. Do not
average away individual false positives or false negatives.

## Threats to validity

- The corpus is authored alongside the MVP and may favor its rule patterns.
- Hand-reviewed formal models do not measure extraction effort or errors.
- Ten cases are sufficient for a vertical slice, not product claims.
- Category-level scoring does not measure explanation quality deeply.
- The document baseline represents artifacts, not all possible human review.

The next corpus revision should be prepared blind from real historical defects
across several repositories, then frozen before rule changes are evaluated.

