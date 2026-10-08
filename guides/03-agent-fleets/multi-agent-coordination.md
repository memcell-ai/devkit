# Multi-Agent Coordination & Hallucination Defense

When orchestrating multiple autonomous agents (e.g. planner, researcher, executor, auditor), a common hazard is the **hallucination cascade**: one agent generates a speculative assumption, saves it as fact, and downstream agents adopt it as foundational truth, compounding the error exponentially.

MemCell provides native epistemic defenses to enable multi-agent coordination without hallucination cascades.

---

## The Hallucination Cascade Problem

```
Without Epistemic Governance:
┌────────────────┐     Speculative Output     ┌────────────────────┐
│ Agent A        │ ─────────────────────────► │ Shared Database    │
│ (Researcher)   │  "Competitor acquired X"   │ (Unfiltered write) │
└────────────────┘                            └─────────┬──────────┘
                                                        │
                                                        ▼
                                              ┌────────────────────┐
                                              │ Agent B            │
                                              │ (Executive Writer) │
                                              └─────────┬──────────┘
                                                        │ Generates press release
                                                        ▼
                                              ⚠️ Critical Falsehood Amplified
```

---

## MemCell Epistemic Defenses

```
With MemCell Epistemic Governance:
┌────────────────┐  remember({ status: "provisional" })
│ Agent A        │ ────────────────────────────────────► ┌──────────────────────┐
│ (Researcher)   │                                       │ Workspace Memory     │
└────────────────┘                                       │ Status: provisional  │
                                                         │ Confidence: 0.40     │
                                                         └──────────┬───────────┘
                                                                    │
                                   Blocked by minConfidence: 0.70   │
                                ┌───────────────────────────────────┘
                                ▼
                      ┌────────────────────┐
                      │ Agent B            │
                      │ (Executive Writer) │
                      └────────────────────┘
                      ✓ Ignores unverified speculation
```

### 1. Ingest Speculation as `provisional`

When autonomous agents extract facts or insights from unstructured external data, always record them with `status: "provisional"`:

```typescript
await client.memories.remember("acme/market-analysis", {
  title:
    "Emerging trend: 40% jump in European demand for sustainable packaging",
  type: "observation",
  status: "provisional",
  metadata: {
    source: "unverified_analyst_blog",
    recordedBy: "research-agent-v2",
  },
});
```

Downstream agents running standard recall queries will **not** receive this memory until it is upheld by additional evidence or calibrated by a supervisor.

### 2. Enforce High Confidence Floors on Critical Steps

When an agent is performing high-stakes actions (such as dispatching emails or executing transactions), raise the confidence floor:

```typescript
const { promptContext } = await client.recall.search("acme/operations", {
  intent: "Approve customer credit increase",
  minConfidence: 0.85, // Filter out weak or decaying memories
});
```

### 3. Dedicated Verification Agents

In high-performing multi-agent architectures, employ a dedicated **Auditor Agent** whose sole role is testing claims:

```typescript
// Auditor tests the claim against verified databases
const verified = await verifyAgainstFinancialLedger(claim);

if (verified) {
  await client.report("acme/operations", {
    memoryId: claim.id,
    outcome: "upheld",
    reason: "Matched bank statement batch reconciliation.",
  });
} else {
  await client.report("acme/operations", {
    memoryId: claim.id,
    outcome: "refuted",
    reason: "Zero matching entries found in banking records.",
  });
}
```

### 4. Guard Memories as Absolute Boundaries

To prevent agents from exceeding their operational envelope regardless of prompt phrasing, inject immutable `guard` memories with `enforce: true`:

```typescript
await client.memories.remember("acme/operations", {
  title:
    "Never authorize single-agent refund approval over $1,000 without human in the loop",
  type: "guard",
  enforce: true,
});
```

MemCell's recall engine synthesizes enforced guards prominently at the top of the prompt context, commanding model adherence.
