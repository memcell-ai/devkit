<p align="center">
  <img src="https://memcell.ai/icon.svg" width="56" alt="MemCell Logo" />
</p>

<h1 align="center">@memcell/sdk</h1>

<p align="center">
  <strong>Official TypeScript and Node.js SDK for MemCell.</strong><br />
  Persistent, adaptive memory substrate for AI agents, workflows, and LLM pipelines.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@memcell/sdk"><img src="https://img.shields.io/npm/v/@memcell/sdk.svg?style=flat" alt="npm version" /></a>
  <a href="https://github.com/memcell-ai/sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js >= 18" /></a>
  <a href="https://memcell.ai/docs"><img src="https://img.shields.io/badge/docs-memcell.ai-blue" alt="Documentation" /></a>
</p>

```bash
npm install @memcell/sdk
```

```typescript
import { MemCell } from "@memcell/sdk";

const memory = new MemCell({
  apiKey: process.env.MEMCELL_API_KEY!,
});

// 1. Recall relevant statements before an agent acts:
const { promptContext } = await memory.recall({
  namespace: "acme/support",
  query: "refund verification and escalation thresholds",
});

console.log(promptContext);
// [directive] Require explicit customer confirmation before applying refunds over $500 (confidence: 0.94)
```

---

## Core Primitives

### 1. `recall` — Query Memory Before Acting

Query verified directives, facts, preferences, and observations using natural language.

```typescript
const recall = await memory.recall({
  namespace: "acme/support",
  query: "refund verification and escalation thresholds",
});

// promptContext is formatted and ready to drop directly into agent system or user prompts:
console.log(recall.promptContext);
```

### 2. `remember` — Save Statements

Save a verified directive, fact, preference, or observation so future agents inherit it immediately:

```typescript
await memory.remember({
  namespace: "acme/support",
  title:
    "Require explicit customer confirmation before applying refunds over $500",
  type: "directive",
});
```

### 3. `report` — Close the Feedback Loop

Memory adapts when told what happened. When an agent succeeds or fails after applying memory, report the outcome:

```typescript
await memory.report({
  namespace: "acme/support",
  statementId: "stmt_019a4b2c",
  outcome: "worked", // "worked" | "failed" | "avoided"
  reason: "Customer verified and refund issued within guidelines",
});
```

---

## Closed-Loop Execution (`wrapExecution`)

With `wrapExecution`, you can wrap any agent action or tool invocation in a **self-healing, closed-loop memory**:

```typescript
import { MemCell } from "@memcell/sdk";

const memory = new MemCell({ apiKey: process.env.MEMCELL_API_KEY! });

// Scope memory to your project:
const support = memory.scope("acme/support");

async function handleRefund(ticketId: string, amount: number) {
  return await support.wrapExecution(
    {
      action: "process_refund",
      query: "refund verification requirements",
    },
    async (ctx) => {
      // 1. ctx.promptContext automatically contains active statements:
      //    e.g. "[directive] Require explicit customer confirmation before applying refunds over $500"

      // 2. Execute operation with verified context:
      const res = await processRefund(ticketId, amount);

      // 3. Automatically reports "worked" on success (or "failed" on error) and updates confidence scores.
      return res;
    },
  );
}
```

---

## Resource Namespaces

The SDK provides direct, typed access to all MemCell platform resources:

### Statements (`memory.statements`)

- `list(namespace, params)`: Paginated query with filtering by `type`, `status`, `scope`, `q`, `sort`.
- `get(namespace, id)`: Retrieve an individual statement.
- `create(namespace, params)`: Create a statement (`directive`, `fact`, `preference`, `observation`).
- `update(namespace, id, params)`: Update statement content, status, confidence, or metadata.
- `delete(namespace, id)`: Delete a statement.
- `star(namespace, id, starred)`: Star or unstar a statement.
- `history(namespace, id)`: Retrieve complete version and mutation history.
- `adopt(namespace, id, { targetProjectIds })`: Adopt a statement into other projects.
- `promote(namespace, id, { toScope, reason })`: Promote a provisional statement to active.

### Projects (`memory.projects`)

- `list(params)`: List caller's accessible projects.
- `listForOwner(owner, params)`: List projects belonging to an owner.
- `get(namespace)`: Retrieve project details.
- `create(params)`: Create a new project.
- `update(namespace, params)`: Update project properties.
- `delete(namespace)`: Delete a project.
- `transfer(namespace, { targetOwner })`: Transfer project ownership.

### Agents (`memory.agents`)

- `list(namespace, params)`: List agents registered in a project.
- `get(namespace, agentId)`: Retrieve agent details.
- `create(namespace, params)`: Register an agent.
- `update(namespace, agentId, params)`: Update agent configuration.
- `delete(namespace, agentId)`: Deregister an agent.
- `createKey(namespace, agentId, params)`: Generate a scoped agent API key.
- `revokeKey(namespace, agentId, keyId)`: Revoke an agent key.

### Collaborators (`memory.collaborators`)

- `list(namespace, params)`: List project collaborators and pending invitations.
- `invite(namespace, { identifier, role })`: Invite a user or email to collaborate.
- `updateRole(namespace, userId, role)`: Update a collaborator's role.
- `remove(namespace, userId)`: Remove a collaborator.
- `revokeInvitation(namespace, invitationId)`: Revoke an invitation.

### Organizations (`memory.organizations`)

- `list(params)`, `get(orgSlug)`, `create(params)`, `update(orgSlug, params)`, `delete(orgSlug)`
- `listMembers(orgSlug, params)`, `updateMemberRole(orgSlug, userId, role)`, `removeMember(orgSlug, userId)`
- `listInvitations(orgSlug)`, `inviteMember(orgSlug, params)`, `revokeInvitation(orgSlug, invitationId)`

### Usage & Quotas (`memory.usage`)

- `get(owner, { timeframe })`: Retrieve statement type breakdown and API quotas.

### Account (`memory.account`)

- `get()`, `updateProfile(params)`
- `tokens.list()`, `tokens.create(params)`, `tokens.revoke(tokenId)`

### Scoped Handle (`memory.scope(namespace)`)

Provides convenient namespace-bound access:

- `scoped.statements.*`, `scoped.agents.*`, `scoped.collaborators.*`, `scoped.scopes.list()`

### Machine-to-Machine (M2M) OAuth 2.0

For enterprise and backend microservices, authenticate using client credentials. Tokens are automatically exchanged and refreshed 60 seconds before expiration:

```typescript
const memory = new MemCell({
  auth: {
    clientId: process.env.MEMCELL_CLIENT_ID!,
    clientSecret: process.env.MEMCELL_CLIENT_SECRET!,
    scope: "memory:read:acme/* memory:write:acme/backend",
  },
});
```

### Built-in 429 Resilience

MemCell automatically handles HTTP 429 rate limits with randomized jittered exponential backoff respecting the server's `Retry-After` header:

```typescript
const memory = new MemCell({
  apiKey: process.env.MEMCELL_API_KEY!,
  maxRetries: 3, // default: 3
  onRateLimitWarning: (warning) => {
    // Dual-threshold warning (80-99% capacity) without interrupting execution
    console.warn("Approaching rate limit:", warning.limit);
  },
});
```

---

## Links

- **Documentation**: [https://memcell.ai/docs](https://memcell.ai/docs)
- **Developer CLI**: [`npm install -g memcell`](https://www.npmjs.com/package/memcell)
- **GitHub Repository**: [https://github.com/memcell-ai/sdk](https://github.com/memcell-ai/sdk)

Apache License 2.0 · © 2026 OpenOri
