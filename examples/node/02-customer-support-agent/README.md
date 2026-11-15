# 02 — Customer Support Triage Agent

## The Story

A SaaS support team runs an autonomous triage agent that resolves routine questions automatically, but must strictly obey company financial controls—such as escalating any refund request over \$200 to a Tier-2 human supervisor.

Instead of hardcoding brittle `if/else` rules into prompt templates across every microservice, the team stores standing policies in MemCell as **enforced workspace instructions** (`type: "instruction"`, `enforce: true`) and runs each ticket inside `scoped.wrapExecution()`. Before acting on a ticket, the agent recalls active policies, checks whether any enforced rule applies, and automatically reports `"worked"` or `"failed"` after execution so policy confidence stays calibrated.

## SDK Capabilities Demonstrated

- **Scoped Workspace Handle (`client.scope`)**: Bind `namespace` and default `subject` once.
- **Enforced Instructions (`type: "instruction", enforce: true`)**: First-class operational guardrails returned with `guardMode: "enforced"`.
- **Closed-Loop Execution (`scoped.wrapExecution`)**: Automatic pre-flight recall and post-flight outcome reporting in a single call.

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/support"

pnpm start
```
