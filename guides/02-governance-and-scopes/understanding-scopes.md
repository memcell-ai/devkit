# Understanding Scopes & Boundaries

MemCell provides fine-grained epistemic governance through **Scopes**. Scopes define who can read, modify, and recall memories across individuals, agents, and organizations.

---

## The Four Epistemic Scopes

```
┌─────────────────────────────────────────────────────────────┐
│ ORGANIZATION SCOPE                                          │
│ Global brand values, compliance standards, security policies│
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ TEAM SCOPE                                          │   │
│   │ Functional division guidelines (e.g. Sales, Ops)    │   │
│   │                                                     │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │ WORKSPACE SCOPE                             │   │   │
│   │   │ Dedicated operational workspace knowledge   │   │   │
│   │   └─────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ USER SCOPE (Isolated & Private)                             │
│ Personal habits, individual preferences, operator notes     │
└─────────────────────────────────────────────────────────────┘
```

### 1. Personal Scope (`user`)

- **Access Boundary**: Strictly isolated to the individual user or agent account that filed it.
- **Intended Use**: Private working notes, individual communication preferences, and personal shortcuts.
- **Recall Behavior**: Personal memories are included in recalls initiated by that specific user or their dedicated agent. Other users in the same workspace never see or recall these memories.

### 2. Workspace Scope (`workspace`)

- **Access Boundary**: Shared across all collaborators and agents connected to that specific workspace.
- **Intended Use**: Operational facts, domain guidelines, procedures, and shared context specific to a particular initiative.
- **Recall Behavior**: Retrieved by any connected agent executing within the workspace context.

### 3. Team Scope (`team`)

- **Access Boundary**: Shared across multiple workspaces belonging to a common functional group or department.
- **Intended Use**: Division-wide practices (e.g., standard customer escalations across multiple regional support workspaces).

### 4. Organization Scope (`organization`)

- **Access Boundary**: Accessible across all workspaces under the organization tenant.
- **Intended Use**: Enterprise-level compliance mandates, data protection policies, and global corporate guidelines.

---

## Specifying Scopes in the SDK & CLI

### Node SDK

```typescript
import { MemcellClient } from "@memcell/sdk";

const client = new MemcellClient({ token: process.env.MEMCELL_TOKEN });

// 1. Storing a personal preference (user-scoped)
await client.memories.remember("acme/operations", {
  title:
    "Preferred summary format: bullet points with bulleted risk assessments",
  type: "preference",
  scope: "user",
});

// 2. Storing a shared operational directive (workspace-scoped)
await client.memories.remember("acme/operations", {
  title:
    "Require supervisor authorization for international transactions over $5,000",
  type: "guard",
  scope: "workspace",
  enforce: true,
});
```

### Python SDK

```python
from memcell import MemcellClient

client = MemcellClient(token="mc_pat_...")

# Storing a workspace-scoped operational directive
client.memories.remember(
    "acme/operations",
    title="Customer support response time SLA is 15 minutes during market hours",
    type="directive",
    scope="workspace",
)
```

### CLI

```bash
# Remember a personal preference
memcell remember "Always format financial estimates in USD" --scope user

# Remember a workspace guideline
memcell remember "All vendor contracts require legal team sign-off" --scope workspace --type guard
```
