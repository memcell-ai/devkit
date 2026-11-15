# 05 — Financial Compliance Auditor (`enforce=True` & `wrap_execution`)

## The Story

An automated treasury agent processes international wire transfers. Regulatory rules—such as requiring dual-officer signatures above \$10,000 or blocking sanctioned jurisdictions—must be enforced deterministically and every audit decision must leave an attribution trail.

By storing compliance rules with `type="instruction", enforce=True` and executing each wire check inside `scoped.wrap_execution()`, the agent retrieves enforced policies prior to disbursement and automatically records `"worked"` or `"failed"` outcome telemetry for compliance auditing.

## SDK Capabilities Demonstrated

- **Enforced Instructions (`type="instruction", enforce=True`)**
- **Closed-Loop Execution (`scoped.wrap_execution`)**

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/compliance"

python main.py
```
