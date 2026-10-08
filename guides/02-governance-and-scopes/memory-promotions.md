# Memory Evolution & Promotion Workflows

As individual agents and human operators interact within a workspace, valuable insights frequently emerge at the personal scope. A personal shortcut or newly discovered procedure often deserves to become standard practice across an entire workspace or organization.

**Memory Promotion** provides the formal mechanism to elevate knowledge across scope boundaries while maintaining rigorous epistemic governance.

---

## The Promotion Lifecycle

```
┌─────────────────────────────────┐
│ Personal Memory (Scope: user)   │
│ "Discovered high-impact vendor" │
└────────────────┬────────────────┘
                 │
                 │ Agent or User calls `promote(memoryId, toScope: "workspace")`
                 ▼
     ┌───────────────────────┐
     │ Has Admin / Promotion │
     │ Privileges?           │
     └───────────┬───────────┘
                 │
        ┌────────┴────────┐
     Yes│                 │No
        ▼                 ▼
┌───────────────┐ ┌────────────────────────────────────────┐
│   Promoted    │ │ Pending Review Request                 │
│ Immediately   │ │ Awaiting workspace administrator review│
└───────────────┘ └───────────────────┬────────────────────┘
                                      │
                              ┌───────┴───────┐
                       Approve│               │Reject
                              ▼               ▼
                      ┌───────────────┐ ┌──────────────┐
                      │   Promoted    │ │ Rejected     │
                      │ To Workspace  │ │ Stays User   │
                      └───────────────┘ └──────────────┘
```

---

## Promoting a Memory

### Using the CLI

When an operator wants to elevate a personal memory to workspace scope:

```bash
# Propose or execute elevation to workspace scope
memcell promote <memory-id> --to workspace --reason "Discovered standard operating protocol for API rate limits"
```

If the caller has administrative privileges, the memory is elevated immediately. If the caller has standard contributor permissions, a **Promotion Request** is created for review.

### Using the Node SDK

```typescript
import { MemcellClient } from "@memcell/sdk";

const client = new MemcellClient({ token: process.env.MEMCELL_TOKEN });

const result = await client.promotions.request("acme/operations", {
  memoryId: "4b87e21a-6d11-4770-9831-29e18b10cae7",
  toScope: "workspace",
  reason: "Validated procedure across 50 simulated customer interactions.",
});

if (result.status === "approved") {
  console.log("Memory promoted directly to workspace scope.");
} else {
  console.log("Promotion request submitted for review, ID:", result.id);
}
```

---

## Managing Promotion Requests (Administrators)

Workspace administrators can review, approve, or reject pending promotion requests to keep the shared memory pool clean and authoritative.

### Listing Pending Requests

```bash
memcell promotions list
```

```typescript
const pending = await client.promotions.list("acme/operations", {
  status: "pending",
});
```

### Approving or Rejecting Requests

```bash
# Approve a promotion request
memcell promotion approve <request-id>

# Reject a request with feedback
memcell promotion reject <request-id> --reason "Conflicts with global organization privacy policy."
```

```typescript
// Approve via SDK
await client.promotions.approve("acme/operations", requestId);

// Reject via SDK
await client.promotions.reject(
  "acme/operations",
  requestId,
  "Insufficient empirical evidence.",
);
```

---

## Best Practices for Agent Promotion Pipelines

1. **Auto-Promote on Consensus**: Configure verification agents to observe personal agent memories and request promotion once a pattern has been successfully repeated across multiple runs.
2. **Review Gates for Sensitive Guards**: Always require administrative approval when promoting memories of `type: "guard"` with `enforce: true` to prevent unreviewed restrictions from blocking agent pipelines.
3. **Audit Trails**: Every promotion retains the initiating agent's identity, the approving user's identity, and the contextual rationale.
