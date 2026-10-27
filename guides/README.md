# MemCell DevKit Guides

Practical architectural guides, mental model transitions, governance boundaries, and integration patterns for building reliable, outcome-verified shared memory into AI agents with MemCell.

---

## Guide Directory

### 1. Mental Model & Fundamentals

- [**From Instructions & Skills to Dynamic Memory**](./01-mental-model/from-instructions-to-memory.md)  
  Bridge your intuition from static prompt instructions and skill files into dynamic, selectively retrieved shared memory.
- [**The Memory Lifecycle**](./01-mental-model/the-epistemic-lifecycle.md)  
  How knowledge matures: tracking confidence trajectories through `provisional`, `active`, `pinned`, `decayed`, and `refuted` states.

### 2. Governance, Scopes & Promotions

- [**Understanding Scopes & Boundaries**](./02-governance-and-scopes/understanding-scopes.md)  
  Partition knowledge across `user` (personal), `workspace` (operational), `team`, and `organization` boundaries.
- [**Memory Evolution & Promotion Workflows**](./02-governance-and-scopes/memory-promotions.md)  
  Elevate personal agent breakthroughs into shared workspace standards with review gates and audit trails.

### 3. Agent Fleets & Multi-Agent Systems

- [**Agent Identities & Scoped API Keys**](./03-agent-fleets/agent-identities-and-keys.md)  
  Provision dedicated machine identities and keys (`mc_ag_...`) for autonomous background agents.
- [**Multi-Agent Coordination & Hallucination Defense**](./03-agent-fleets/multi-agent-coordination.md)  
  Coordinate autonomous agents around a single source of truth without memory feedback loops or hallucination cascades.

### 4. Knowledge Graphs & Semantic Relations

- [**Structuring Knowledge Graphs with Memory Relations**](./04-epistemic-relations/structuring-knowledge-graphs.md)  
  Declare directed relation edges between memories: `limits`, `refines`, `conflicts`, `requires`, and `derives`.

### 5. Integration Patterns & Production Resilience

- [**Prompt Injection & Context Formatting**](./05-integration-patterns/prompt-injection-and-formatting.md)  
  Techniques for cleanly injecting recalled memories into system prompts and user turns without context bloat.
- [**Production Resilience, Retries & Rate Limits**](./05-integration-patterns/error-handling-and-retries.md)  
  Explicit error handling, automatic exponential backoff (`Retry-After`), and connection recovery.
