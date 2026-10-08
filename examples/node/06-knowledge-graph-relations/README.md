# Epistemic Knowledge Graph Relations (Node.js)

Demonstrates how to build and traverse a directed epistemic knowledge graph using MemCell:

1. Creates a high-level policy `guard` and an operational `directive`.
2. Connects them with a directed `limits` relation edge using `client.relations.relate()`.
3. Traverses incoming and outgoing relation edges with `client.relations.list()`.
4. Observes how semantic recall automatically includes governing constraints in `promptContext`.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/graph-demo"

pnpm start
```
