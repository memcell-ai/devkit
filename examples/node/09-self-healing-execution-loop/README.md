# 09 — "Fail Once, Never Again": Self-Healing Execution Loop

## The Story

When an autonomous agent hits an unexpected API change or operational failure in production (such as a partner gateway rejecting requests missing an `Idempotency-Key` header), stateless agents repeat the exact same mistake on every retry or across peer workers.

By wrapping tool calls and agent turns in `scoped.wrapExecution({ autoDistill: true })`:
1. **Subagent A** attempts the payout call using an older instruction and throws an `HTTP 422` error.
2. `wrapExecution` catches the exception before re-throwing, automatically reports `outcome: "failed"` with the error reason, **decays the confidence** of the outdated memory, and **auto-distills a corrective enforced instruction**.
3. When **Subagent B** is dispatched by the orchestrator moments later, its pre-flight recall automatically retrieves the newly distilled instruction, attaches the `Idempotency-Key` header, succeeds on the first try, and reinforces the new rule's confidence.

## SDK Capabilities Demonstrated

- **`scoped.wrapExecution` Error Attribution**: Automatic `outcome: "failed"` reporting without swallowing exceptions.
- **Auto-Distillation (`autoDistill: true`)**: Turning runtime failure reasons into enforceable corrective instructions (`distilledMemory`).
- **Confidence Calibration**: Decaying misleading memories while boosting verified remedies.

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/sre-self-healing"

pnpm start
```

