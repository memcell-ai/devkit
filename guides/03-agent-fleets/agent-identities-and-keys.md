# Agent Identities & Scoped API Keys

In production environments, AI agents should never operate anonymously under a developer's personal user token. MemCell treats autonomous agents as **first-class identities** within workspaces.

By registering individual agents and issuing dedicated **Agent Keys** (`mc_ag_...`), teams achieve granular audit logging, rate limiting, and access control.

---

## Agent Identity Architecture

```
┌────────────────────────────────────────────────────────┐
│ Workspace: acme/support                                │
│                                                        │
│  ┌───────────────────────┐   ┌───────────────────────┐ │
│  │ Agent: Triage Bot     │   │ Agent: Policy Auditor │ │
│  │ ID: 9f12...           │   │ ID: 3e4a...           │ │
│  │ Key: mc_ag_triage...  │   │ Key: mc_ag_audit...   │ │
│  └───────────┬───────────┘   └───────────┬───────────┘ │
│              │                           │             │
│              ▼                           ▼             │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Epistemic Audit Log & Usage Quotas                 │ │
│  │ - "Triage Bot recalled 12 memories at 14:02"       │ │
│  │ - "Policy Auditor filed guard memory at 14:15"     │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

## Provisioning Agents and Keys

### Step 1: Register the Agent Identity

```bash
memcell agent new "Triage Bot" \
  --description "Autonomous agent routing customer tickets to appropriate department" \
  --type "support_pipeline"
```

```typescript
import { MemcellClient } from "@memcell/sdk";

const client = new MemcellClient({ token: process.env.MEMCELL_ADMIN_TOKEN });

const agent = await client.agents.create("acme/support", {
  name: "Triage Bot",
  description:
    "Autonomous agent routing customer tickets to appropriate department",
});
console.log("Registered agent ID:", agent.id);
```

### Step 2: Mint a Dedicated Agent Key

Once the identity is established, mint an agent key:

```bash
memcell agent key create <agent-id>
```

```typescript
const keyRecord = await client.agents.createKey("acme/support", agent.id);

// Store keyRecord.key securely (e.g. in your secret manager or environment variable)
console.log("Agent Token:", keyRecord.key); // "mc_ag_..."
console.log("Key Preview:", keyRecord.preview); // "mc_ag_3fa1..."
```

> [!IMPORTANT]
> The full raw secret key (`mc_ag_...`) is returned only once at creation time. MemCell stores only a cryptographic SHA-256 hash.

---

## Using Agent Keys in Agent Runtimes

Configure the autonomous agent worker with its dedicated agent token:

```typescript
// Initializing an SDK client authenticated as the specific agent
const agentClient = new MemcellClient({
  token: process.env.MEMCELL_AGENT_KEY, // mc_ag_...
});

// The agent recalls context in the workspace
const recallResult = await agentClient.recall.search("acme/support", {
  intent: "Escalate delayed delivery inquiry for order #1082",
});
```

---

## Key Standing, Quotas & Revocation

### Checking Current Key Standing

An agent can inspect its own status, rate limit standing, and active workspace:

```bash
memcell agent whoami
```

### Revoking a Compromised or Retired Key

If a machine is compromised or an agent version is decommissioned:

```bash
# Revoke by key ID directly
memcell agent key revoke <key-id>

# Or revoke via agent ID and key ID
memcell agent key revoke <agent-id> <key-id>
```

```typescript
// Revoke via SDK
await client.agents.revokeKey("acme/support", agent.id, keyId);
```
