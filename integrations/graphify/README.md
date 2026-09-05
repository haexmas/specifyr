# Graphify companion integration

Build or update a Graphify graph, then import it:

```bash
graphify update . --no-cluster
specifyr graphify-import --graph graphify-out/graph.json
```

The result is a candidate set, not a Spec Model. No candidate becomes an
active claim or rule automatically. A future review command will produce a
source patch containing visible `specifyr` blocks.

