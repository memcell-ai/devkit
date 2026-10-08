# The Epistemic Lifecycle of a Memory

In MemCell, knowledge is not a static database row. It is an **epistemic claim** with a measurable lifecycle, a confidence trajectory, and an immutable audit trail.

Understanding how a memory evolves from its creation to its validation or refutation is fundamental to designing robust autonomous agent systems.

---

## The Five Epistemic States

Every memory exists in one of five distinct states:

```
               ┌─────────────┐
               │ Provisional │ (Unverified hypothesis or newly observed pattern)
               └──────┬──────┘
                      │ Upheld / Calibrated
                      ▼
               ┌─────────────┐   Pinned by Operator
               │   Active    │ ────────────────────► ┌────────┐
               └──────┬──────┘                       │ Pinned │ (Immutable invariant)
                      │                              └────────┘
         ┌────────────┴────────────┐
         │ Inactivity / Drift      │ Outcome: Violated / Contradicted
         ▼                         ▼
   ┌───────────┐             ┌───────────┐
   │  Decayed  │             │  Refuted  │ (Permanently invalidated)
   └───────────┘             └───────────┘
```

### 1. `provisional`

- **What it is**: A tentative hypothesis, observation, or unconfirmed directive.
- **When to use it**: When an agent detects a pattern in data or conversations that has not yet been verified by a human operator or repeated execution.
- **Recall behavior**: Filtered out by default during recall unless `allowProvisional: true` is explicitly passed.

### 2. `active`

- **What it is**: The standard working state of established workspace knowledge.
- **Confidence range**: Dynamically calibrated between `0.0` and `1.0`.
- **Recall behavior**: Retrieved when semantic intent matches and confidence meets the caller's `minConfidence` floor.

### 3. `pinned`

- **What it is**: High-priority invariants or foundational guidelines explicitly pinned by a workspace administrator.
- **Recall behavior**: Bypasses decay and maintains maximum weight during recall synthesis.

### 4. `decayed`

- **What it is**: Knowledge that has not been recalled or reinforced over an extended temporal window, or whose relevance has waned as the workspace evolved.
- **Recall behavior**: Weighted down or excluded when higher-confidence recent memories are available.

### 5. `refuted`

- **What it is**: Knowledge that has been explicitly contradicted by evidence, human feedback, or repeated negative outcomes.
- **Recall behavior**: Excluded from standard prompt context. Serves as historical negative evidence to prevent agents from repeating past errors.

---

## Confidence Trajectories & Outcome Reporting

Memories do not remain static after creation. Whenever an agent performs an action guided by a memory, it reports the outcome using the `report` endpoint.

```typescript
// Reporting an outcome after task execution
await client.report("acme/research", {
  memoryId: "3b08e5c2-f19d-4780-9289-e1e7939dd5b0",
  outcome: "upheld", // or "violated", "refuted"
  reason: "Agent adhered to the privacy boundary during customer interview.",
});
```

### Supported Outcomes

- `upheld`: The memory was tested in real execution and was valid, increasing its confidence score.
- `violated`: The agent or external environment violated the memory directive, signaling potential misalignment.
- `refuted`: The memory claim was proven incorrect or obsolete, initiating retirement of the claim.

---

## Immutable Revision History

MemCell maintains a complete cryptographic version history for every memory:

- Every update creates a new immutable version with a deterministic SHA-256 hash.
- Edits preserve the lineage (`parentHash`, `version`, `changeReason`).
- CLI users can inspect revisions at any time:
  ```bash
  memcell memory history <memory-id>
  ```
- SDK users can inspect the complete trajectory programmatically:
  ```typescript
  const history = await client.memories.history("acme/operations", memoryId);
  console.log(history.items);
  ```
