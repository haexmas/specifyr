# Architecture and trust model

## Boundary

`specifyr` separates discovery from judgment:

1. Speckit/ADR adapters extract deterministic structure.
2. Graphify contributes non-authoritative candidate nodes and relations.
3. Review promotes selected statements into visible formal claims.
4. The checker evaluates only accepted Spec Models and rule packs.

The checker never invokes a model, accesses the network, or mutates source
artifacts. Graphify unavailability cannot prevent checking accepted claims.

## Trusted computing base

The trusted base is intentionally small:

- Spec Model and Rule Pack validators
- six finite rule evaluators
- stable finding construction
- deterministic JSON parsing/serialization

Graphify, future LLM formalizers, visualization, and IDE integration sit
outside this boundary. Their output always has `authoritative: false` until a
reviewed source change promotes it.

## Knowledge states

The MVP preserves the distinction required for four-state reasoning:

- positive support is an explicit positive claim;
- refutation is an explicit negative or `must_not` claim;
- both produce a conflict finding;
- neither remains unknown unless a relation is declared closed-world.

Closed-world assumptions are predicate-specific in `model.closed_world`.
Absence never implies false globally.

## Extensibility

The core meta-model is stable while domain vocabularies are namespaced. A
project may define `haex:*`, `web:*`, or other concepts without changing the
checker. Rule packs use reusable patterns over those predicates.

New arbitrary executable rule code is intentionally not accepted. New rule
patterns require code review, examples, mutation coverage, and a versioned
release of the checker. Data-only rule instances can be added independently.

## Graphify integration

The adapter accepts Graphify's array-shaped graph or the common NetworkX-style
node mapping. It preserves:

- node labels and source locations;
- edge predicates;
- `EXTRACTED`, `INFERRED`, and `AMBIGUOUS` confidence;
- the original payload for review.

Confidence describes extraction provenance, not formal truth. Even an
`EXTRACTED` document edge remains a candidate because document extraction may
have used a language model.

