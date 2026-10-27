# `@memcell/benchmarks` — Operational Memory & Governance Benchmark

Open-source (`Apache-2.0`), deterministic benchmark suite evaluating **multi-session AI agent memory architectures** across four general-agent operational domains:

1. **Customer Support** (SLA escalations, GDPR retention holds)
2. **Cloud & Incident Operations** (gateway failovers, queue dead-letter caps)
3. **Finance & Billing Compliance** (multi-currency wire sign-offs, revenue cut-off rules)
4. **Market & Vendor Research** (primary filing verification, enterprise security RFPs)

Unlike chat-fact recall benchmarks that only measure whether a Retriever can find a sentence from a transcript, `@memcell/benchmarks` measures **operational governance and outcome reliability** across 5 stages per episode (40 probes per architecture):

- **Grounded Policy Recall** — retrieving verified workspace instructions over unverified drafts and operational chatter.
- **Repeat-Failure Avoidance** — refuting/demoting failed workarounds after `report(outcome: "failed")` and serving verified fixes.
- **Poisoned-Turn Quarantine** — isolating unpromoted `user`-scope / `provisional` session shortcuts from polluting team-wide recall.
- **Cross-Vendor Agent Handoff** — resuming compacted decisions and milestones when an OpenAI/LangGraph agent picks up after an Anthropic/Claude agent.
- **Pre-Action Guard Enforcement** — sub-millisecond (`<1ms`) boundary enforcement on side-effecting `send`, `change`, and `record` actions (`enforce: true` + `appliesAt`).

---

## Run Locally (Zero API Keys Required)

```bash
pnpm --filter "@memcell/benchmarks" run bench
```

Emit machine-readable JSON:

```bash
pnpm --filter "@memcell/benchmarks" run bench -- --json
```

Run against a live MemCell workspace alongside the offline reference arms:

```bash
MEMCELL_API_KEY="mc_..." MEMCELL_WORKSPACE="acme/ops" \
  pnpm --filter "@memcell/benchmarks" run bench -- --live
```

---

## Reference Results (v1.0.0 — 40 Multi-Session Probes)

| Architecture                    |           Overall | Grounded Recall | Repeat Avoidance | Poison Shield | Cross-Vendor | Pre-Action Guard |
| :------------------------------ | ----------------: | --------------: | ---------------: | ------------: | -----------: | ---------------: |
| **MemCell Governed Memory**     | **95.0%** (38/40) |           87.5% |           100.0% |        100.0% |        87.5% |           100.0% |
| **Single-Vendor Siloed Memory** | **42.5%** (17/40) |           87.5% |            50.0% |         50.0% |         0.0% |            25.0% |
| **Naive Vector Store**          | **42.5%** (17/40) |           87.5% |            37.5% |         12.5% |        62.5% |            12.5% |
| **Append-Only Markdown**        | **37.5%** (15/40) |           75.0% |            12.5% |         25.0% |        50.0% |            25.0% |
