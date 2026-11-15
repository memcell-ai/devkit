# 06 — Epistemic Knowledge Graph Relations (Node.js)

## The Story

In complex enterprise workflows, individual memories rarely stand alone: a high-level treasury security guard (`enforce: true`) **limits** how an automated nightly batch payment instruction is allowed to run.

This example demonstrates how to build and traverse a directed epistemic knowledge graph using MemCell:
1. Creates an enforced security `instruction` (`enforce: true`) and an operational batch `instruction`.
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
