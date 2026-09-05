# Spec Kit integration

The MVP provides a workflow profile and deterministic extractor. A future Spec
Kit extension should expose:

```text
speckit.formalize
speckit.verify
speckit.explain
speckit.coverage
```

Recommended gates:

- after `specify`: unresolved references and ambiguity;
- after `plan`: active-claim satisfiability and lifecycle staleness;
- after `tasks`: requirement coverage and dependency cycles.

The extension must invoke the local deterministic CLI and must not require
Graphify or a model to verify already accepted claims.

