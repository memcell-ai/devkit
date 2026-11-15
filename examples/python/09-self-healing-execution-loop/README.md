# 09 — "Fail Once, Never Again": Self-Healing Execution Loop (Python)

## The Story

When an autonomous Python worker hits a runtime error in production (such as a partner gateway rejecting requests missing an `Idempotency-Key` header), stateless agents repeat the exact same mistake on every retry or across peer workers.

By wrapping execution in `scoped.wrap_execution()` and `arun_with_openai_memory()`:

1. **Subagent A** attempts the payout call using an older instruction and raises a `RuntimeError` (`HTTP 422`).
2. `wrap_execution` catches the exception before re-raising, automatically reports `outcome="failed"` with the error reason, **decays the confidence** of the outdated memory, and **auto-distills a corrective enforced instruction**.
3. When **Subagent B** runs moments later via `arun_with_openai_memory()`, its pre-flight recall retrieves the newly distilled instruction, attaches the `Idempotency-Key` header, succeeds on the first try, and reinforces the new rule's confidence.

## SDK Capabilities Demonstrated

- **`AsyncScopedMemCell.wrap_execution`**: Async pre-flight recall + automatic failure attribution.
- **`arun_with_openai_memory` (`memcell.integrations.openai_agents`)**: OpenAI Agents / Responses closed-loop runner.
- **`register_memcell_tools` (`memcell.integrations.pydantic_ai`)**: Plain-callable tool registration for PydanticAI agents.

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/sre-self-healing-py"

python main.py
```
