# Structuring Knowledge Graphs with Epistemic Relations

Real-world operational knowledge is rarely a set of isolated bullet points. Guidelines constrain procedures, procedures depend on prerequisite facts, and newly established practices refine or conflict with older directives.

MemCell allows declaring **directed epistemic relation edges** between memories, transforming a flat memory list into a structured epistemic knowledge graph.

---

## Supported Epistemic Relation Types

```
  ┌─────────────────────────────────────────────────┐
  │ Limits: High-level constraint bounds a workflow │
  │ [Security Policy] ───limits───► [Direct Wire]   │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │ Refines: Specialized nuance for a general rule  │
  │ [VIP Priority SLA] ──refines──► [Standard SLA]  │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │ Requires: Prerequisite condition dependency    │
  │ [Execute Trade] ───requires───► [KYC Validated] │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │ Conflicts: Contradictory claims awaiting review │
  │ [Policy Alpha] ───conflicts───► [Policy Beta]   │
  └─────────────────────────────────────────────────┘
```

| Relation Type   | Description                                                                                            |
| :-------------- | :----------------------------------------------------------------------------------------------------- |
| **`limits`**    | The source memory restricts, bounds, or sets a ceiling on the target memory.                           |
| **`refines`**   | The source memory provides specific nuance or an exceptional condition to the general target memory.   |
| **`requires`**  | The target memory is a mandatory prerequisite that must be satisfied before the source memory applies. |
| **`derives`**   | The source memory was deduced or inferred directly from evidence in the target memory.                 |
| **`conflicts`** | Flags two memories asserting incompatible directives, queuing them for epistemic resolution.           |

---

## Declaring Relations via CLI

```bash
# Declare that a risk guard limits an automated disbursement directive
memcell memory relate \
  "c1f8872e-3333-4444-5555-666677778888" \
  "a0b1c2d3-1111-2222-3333-444455556666" \
  --type limits

# List all relations attached to a memory
memcell memory relation c1f8872e-3333-4444-5555-666677778888

# Remove a relation edge
memcell memory unrelate \
  "c1f8872e-3333-4444-5555-666677778888" \
  "a0b1c2d3-1111-2222-3333-444455556666"
```

---

## Declaring Relations via Node SDK

```typescript
import { MemcellClient } from "@memcell/sdk";

const client = new MemcellClient({ token: process.env.MEMCELL_TOKEN });

// 1. Relate two memories
await client.relations.relate("acme/operations", {
  sourceId: guardMemoryId,
  targetId: workflowMemoryId,
  type: "limits",
});

// 2. Query incoming and outgoing graph edges
const relations = await client.relations.list(
  "acme/operations",
  workflowMemoryId,
);

console.log("Outgoing edges:", relations.outgoing);
console.log("Incoming constraints:", relations.incoming);

// 3. Remove an edge when policies change
await client.relations.unrelate("acme/operations", {
  sourceId: guardMemoryId,
  targetId: workflowMemoryId,
});
```

---

## Declaring Relations via Python SDK

```python
from memcell import MemcellClient

client = MemcellClient(token="mc_pat_...")

# Relate memories
client.relations.relate(
    "acme/operations",
    source_id=guard_memory_id,
    target_id=workflow_memory_id,
    relation_type="limits",
)

# Inspect relations graph
relations = client.relations.list("acme/operations", workflow_memory_id)
for edge in relations.incoming:
    print(f"Constrained by: {edge.source_id} ({edge.relation_type})")
```

---

## How Epistemic Graphs Impact Recall

When an agent searches for memories matching an intent, MemCell doesn't merely run isolated vector embeddings:

1. **Semantic Matching**: Identifies candidate memory nodes.
2. **Graph Expansion**: Traverses connected `limits` and `requires` edges to pull in mandatory dependencies and bounding guards, even if the user query omitted the specific terminology of the guard.
3. **Synthesis**: Produces a coherent `promptContext` containing both the operational instructions and their governing boundaries.
