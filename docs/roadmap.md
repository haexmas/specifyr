# Roadmap

## 0.1 — implemented MVP

- Versioned model, rules, findings, candidates, vocabulary, and workflow-profile contracts.
- Deterministic core evaluator and stable diagnostics.
- Speckit/ADR and Graphify adapters.
- Rule assurance and benchmark harness.

## 0.2 — review workflow

- Candidate-to-patch generation; never in-place promotion.
- Alias proposals and vocabulary type checking.
- Source-digest invalidation for reviewed claims.
- JSON and SARIF report output.

## 0.3 — semantic depth

- Scope overlap/subset algebra.
- Conditions and quantified collections.
- Optional Z3 backend with unsatisfiable cores.
- Differential tests between finite and SMT evaluators.
- Operator mutation tests beyond disable-rule mutation.

## 0.4 — ecosystem integration

- Spec Kit extension commands and workflow gates.
- Pinned haex-hive molecule packaging.
- Specifyr review and conflict visualization.
- Evaluate an upstream deterministic Spec Kit/ADR extractor for Graphify.

## Benchmark expansion

- Freeze a blind, multi-repository historical-defect corpus.
- Run repeated `/speckit.analyze` baselines across declared model versions.
- Measure formalization time and reviewer disagreement.
- Separate checker accuracy from automatic formalizer accuracy.

