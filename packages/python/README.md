<p align="center">
  <img src="https://memcell.ai/icon.svg" width="56" alt="MemCell Logo" />
</p>

<h1 align="center">memcell</h1>

<p align="center">
  <strong>Official Python SDK for MemCell.</strong><br />
  Persistent, adaptive memory substrate for AI agents, workflows, and LLM pipelines.
</p>

<p align="center">
  <a href="https://pypi.org/project/memcell"><img src="https://img.shields.io/pypi/v/memcell.svg?style=flat" alt="PyPI version" /></a>
  <a href="https://github.com/memcell-ai/sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" /></a>
  <a href="https://www.python.org"><img src="https://img.shields.io/badge/python-%3E%3D3.10-blue.svg" alt="Python >= 3.10" /></a>
  <a href="https://memcell.ai/docs"><img src="https://img.shields.io/badge/docs-memcell.ai-blue" alt="Documentation" /></a>
</p>

```bash
pip install memcell
# or: uv add memcell
```

```python
import asyncio
from memcell import AsyncMemCell

async def main():
    async with AsyncMemCell(api_key="mc_live_...") as memory:
        # 1. Recall relevant memories before an agent acts:
        recall = await memory.recall(
            namespace="acme/support",
            query="refund verification and escalation thresholds",
        )
        print(recall.prompt_context)
        # [directive] Require explicit customer confirmation before applying refunds over $500 (confidence: 0.94)

asyncio.run(main())
```

---

## Core Primitives

### 1. `recall` — Query Memory Before Acting

Query verified directives, facts, preferences, and observations using natural language.

```python
recall = await memory.recall(
    namespace="acme/support",
    query="refund verification and escalation thresholds",
)

# prompt_context is formatted and ready to drop directly into agent prompts:
print(recall.prompt_context)
```

### 2. `remember` — Save Memories

Save a verified directive, fact, preference, or observation so future agents inherit it immediately:

```python
await memory.remember(
    namespace="acme/support",
    title="Require explicit customer confirmation before applying refunds over $500",
    type="directive",
)
```

### 3. `report` — Close the Feedback Loop

Memory adapts when told what happened. When an agent succeeds or fails after applying memory, report the outcome:

```python
await memory.report(
    namespace="acme/support",
    memory_id="mem_019a4b2c",
    outcome="worked",  # "worked" | "failed" | "avoided"
    reason="Customer verified and refund issued within guidelines",
)
```

---

## Closed-Loop Execution (`wrap_execution`)

With `wrap_execution`, you can wrap any agent action or tool invocation in a **self-healing, closed-loop memory**:

```python
import os
from memcell import AsyncMemCell

async def handle_refund(ticket_id: str, amount: int):
    async with AsyncMemCell(api_key=os.environ["MEMCELL_API_KEY"]) as memory:
        support = memory.scope("acme/support")

        # Wrap execution in a continuous learning loop:
        result = await support.wrap_execution(
            action="process_refund",
            query="refund verification requirements",
            fn=lambda ctx: process_refund(ticket_id, amount),
        )
        # Automatically reports "worked" on success (or "failed" on error) and updates confidence scores.
        return result.result
```

---

## Resource Namespaces

The SDK provides direct, typed access to all MemCell platform resources across both synchronous (`MemCell`) and asynchronous (`AsyncMemCell`) clients:

### Memories (`memory.memories`)

- `list(namespace, ...)`: Paginated query with filtering by `type`, `status`, `scope`, `q`, `sort`.
- `get(namespace, id)`: Retrieve an individual memory.
- `create(namespace, title, type="directive", ...)`: Create a memory (`guard`, `directive`, `fact`, `preference`, `observation`).
- `update(namespace, id, ...)`: Update memory content, status, confidence, or metadata.
- `delete(namespace, id)`: Delete a memory.
- `star(namespace, id, starred=True)`: Star or unstar a memory.
- `history(namespace, id)`: Retrieve complete version and mutation history.
- `adopt(namespace, id, target_project_ids)`: Adopt a memory into other workspaces.
- `promote(namespace, id, to_scope="workspace")`: Promote a provisional memory to active.

### Workspaces (`memory.workspaces`)

- `list(...)`: List caller's accessible workspaces.
- `list_for_owner(owner, ...)`: List workspaces belonging to an owner.
- `get(namespace)`: Retrieve workspace details.
- `create(name, ...)`: Create a new workspace.
- `update(namespace, ...)`: Update workspace properties.
- `delete(namespace)`: Delete a workspace.
- `transfer(namespace, target_owner)`: Transfer workspace ownership.

### Agents (`memory.agents`)

- `list(namespace, ...)`: List agents registered in a workspace.
- `get(namespace, agent_id)`: Retrieve agent details.
- `create(namespace, name, ...)`: Register an agent.
- `update(namespace, agent_id, ...)`: Update agent configuration.
- `delete(namespace, agent_id)`: Deregister an agent.
- `create_key(namespace, agent_id, ...)`: Generate a scoped agent API key.
- `revoke_key(namespace, agent_id, key_id)`: Revoke an agent key.

### Collaborators (`memory.collaborators`)

- `list(namespace, ...)`: List workspace collaborators and pending invitations.
- `invite(namespace, identifier, role="read")`: Invite a user or email to collaborate.
- `update_role(namespace, user_id, role)`: Update a collaborator's role.
- `remove(namespace, user_id)`: Remove a collaborator.
- `revoke_invitation(namespace, invitation_id)`: Revoke an invitation.

### Organizations (`memory.organizations`)

- `list(...)`, `get(org_slug)`, `create(slug, name, ...)`, `update(org_slug, ...)`, `delete(org_slug)`
- `list_members(org_slug, ...)`, `update_member_role(org_slug, user_id, role)`, `remove_member(org_slug, user_id)`
- `list_invitations(org_slug)`, `invite_member(org_slug, email, role, ...)`, `revoke_invitation(org_slug, invitation_id)`

### Usage & Quotas (`memory.usage`)

- `get(owner, timeframe="30d")`: Retrieve memory type breakdown and API quotas.

### Account (`memory.account`)

- `get()`, `update_profile(...)`
- `tokens.list()`, `tokens.create(name, ...)`, `tokens.revoke(token_id)`

### Scoped Handle (`memory.scope(namespace)`)

Provides convenient namespace-bound access:

- `scoped.memories.*`, `scoped.agents.*`, `scoped.collaborators.*`, `scoped.scopes.list()`

---

## Synchronous Client (`MemCell`)

If you are working in synchronous scripts, Celery tasks, or standard Python workers, use the synchronous `MemCell` client with identical ergonomics:

```python
from memcell import MemCell

memory = MemCell(api_key="mc_live_...")

recall = memory.recall(
    namespace="acme/support",
    query="refund verification and escalation thresholds",
)
for memory_item in recall.memories:
    print(f"[{memory_item.type}] {memory_item.title} (confidence: {memory_item.confidence})")
```

---

## Configuration & Resilience

### Machine-to-Machine (M2M) OAuth 2.0

For enterprise and backend microservices, authenticate using client credentials. Tokens are automatically exchanged and refreshed 60 seconds before expiration:

```python
from memcell import AsyncMemCell

memory = AsyncMemCell(
    client_id=os.environ["MEMCELL_CLIENT_ID"],
    client_secret=os.environ["MEMCELL_CLIENT_SECRET"],
    scope="memory:read:acme/* memory:write:acme/backend",
)
```

### Built-in 429 Resilience

MemCell automatically handles HTTP 429 rate limits with randomized jittered exponential backoff respecting the server's `Retry-After` header:

```python
memory = AsyncMemCell(
    api_key="mc_live_...",
    max_retries=3,  # default: 3
    on_rate_limit_warning=lambda warning, response: print(
        f"Approaching rate limit: {warning.limit}"
    ),
)
```

---

## Links

- **Documentation**: [https://memcell.ai/docs](https://memcell.ai/docs)
- **Developer CLI**: [`pip install memcell`](https://pypi.org/project/memcell)
- **GitHub Repository**: [https://github.com/memcell-ai/sdk](https://github.com/memcell-ai/sdk)

Apache License 2.0 · © 2026 OpenOri
