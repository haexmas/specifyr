# spec-logic benchmark

Corpus: `spec-logic-golden-v1` · cases: 10 · runs/case: 25

| Runner | Precision | Recall | F1 | FP | FN | Deterministic | Mean ms/case |
|---|---:|---:|---:|---:|---:|:---:|---:|
| formal | 1.000 | 1.000 | 1.000 | 0 | 0 | true | 0.030 |
| document_baseline | 0.800 | 0.571 | 0.667 | 1 | 3 | true | 0.006 |

## Cases

- `haex-constitution-cardinality-conflict` — expected=['contradiction']; formal=['contradiction']; baseline=[]
- `modal-must-versus-must-not` — expected=['contradiction']; formal=['contradiction']; baseline=[]
- `same-constraint-disjoint-scopes` — expected=[]; formal=[]; baseline=[]
- `plan-references-superseded-decision` — expected=['stale_reference']; formal=['stale_reference']; baseline=['stale_reference']
- `closed-world-requirement-uncovered` — expected=['missing_coverage']; formal=['missing_coverage']; baseline=['missing_coverage']
- `open-world-requirement-not-yet-covered` — expected=[]; formal=[]; baseline=['missing_coverage']
- `task-dependency-cycle` — expected=['dependency_cycle']; formal=['dependency_cycle']; baseline=[]
- `refinement-cycle-allowed` — expected=[]; formal=[]; baseline=[]
- `unresolved-artifact-reference` — expected=['unresolved_reference']; formal=['unresolved_reference']; baseline=['unresolved_reference']
- `explicit-ambiguity` — expected=['ambiguity']; formal=['ambiguity']; baseline=['ambiguity']

## Limitations

- The bundled document baseline is not an execution of the model-driven /speckit.analyze command.
- The curated corpus measures known consistency patterns, not general natural-language understanding.
- External LLM baselines must be repeated and supplied separately to measure variance.
