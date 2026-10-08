# MemCell DevKit Guides

Comprehensive architectural guides, mental model transitions, governance paradigms, and integration patterns for building resilient, long-term memory into AI agents with MemCell.

---

## Guide Directory

### 1. Mental Model & Fundamentals

- [**From Instructions & Skills to Dynamic Memory**](file:///Users/akshay/projects/openori/devkit/guides/01-mental-model/from-instructions-to-memory.md)  
  Bridge your intuition from static prompt instructions and skill files into dynamic, selectively retrieved epistemic memory.
- [**The Epistemic Lifecycle**](file:///Users/akshay/projects/openori/devkit/guides/01-mental-model/the-epistemic-lifecycle.md)  
  How knowledge matures: tracking confidence trajectories through `provisional`, `active`, `pinned`, `decayed`, and `refuted` states.

### 2. Governance, Scopes & Promotions

- [**Understanding Scopes & Boundaries**](file:///Users/akshay/projects/openori/devkit/guides/02-governance-and-scopes/understanding-scopes.md)  
  Partition knowledge across `user` (personal), `workspace` (operational), `team`, and `organization` boundaries.
- [**Memory Evolution & Promotion Workflows**](file:///Users/akshay/projects/openori/devkit/guides/02-governance-and-scopes/memory-promotions.md)  
  Elevate personal agent breakthroughs into shared workspace standards with review gates and audit trails.

### 3. Agent Fleets & Multi-Agent Systems

- [**Agent Identities & Scoped API Keys**](file:///Users/akshay/projects/openori/devkit/guides/03-agent-fleets/agent-identities-and-keys.md)  
  Provision dedicated machine identities and keys (`mc_ag_...`) for autonomous background agents.
- [**Multi-Agent Coordination & Hallucination Defense**](file:///Users/akshay/projects/openori/devkit/guides/03-agent-fleets/multi-agent-coordination.md)  
  Coordinate autonomous agents around a single source of truth without memory feedback loops or hallucination cascades.

### 4. Epistemic Graphs & Semantic Relations

- [**Structuring Knowledge Graphs with Epistemic Relations**](file:///Users/akshay/projects/openori/devkit/guides/04-epistemic-relations/structuring-knowledge-graphs.md)  
  Declare directed epistemic edges between memories: `limits`, `refines`, `conflicts`, `requires`, and `derives`.

### 5. Integration Patterns & Production Resilience

- [**Prompt Injection & Context Formatting**](file:///Users/akshay/projects/openori/devkit/guides/05-integration-patterns/prompt-injection-and-formatting.md)  
  Techniques for cleanly injecting recalled memories into system prompts and user turns without context bloat.
- [**Production Resilience, Retries & Rate Limits**](file:///Users/akshay/projects/openori/devkit/guides/05-integration-patterns/error-handling-and-retries.md)  
  Graceful degradation, fail-open designs, automatic exponential backoff (`Retry-After`), and connection recovery.
