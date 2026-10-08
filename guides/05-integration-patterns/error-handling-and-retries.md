# Production Resilience, Retries & Rate Limits

In mission-critical agent workflows, external network interruptions or API rate limits must never crash the entire agent orchestration loop.

The MemCell DevKit SDKs provide built-in resilient HTTP behaviors, typed error classes, and graceful degradation patterns.

---

## Built-In 429 Rate Limit Handling & Backoff

Both `@memcell/sdk` (Node) and `memcell` (Python) feature **automatic retry with exponential backoff and `Retry-After` parsing**:

1. When MemCell encounters rate limits, it responds with HTTP `429 Too Many Requests` and a standard `Retry-After: <seconds>` header.
2. The SDK intercepts this response, pauses execution for the requested duration (plus randomized jitter), and transparently retries the request up to the configured retry count (default: 3 retries).
3. If retries are completely exhausted, the SDK throws a typed `RateLimitError`.

### Catching `RateLimitError` in Node

```typescript
import { MemcellClient, RateLimitError, MemcellError } from "@memcell/sdk";

const client = new MemcellClient({
  token: process.env.MEMCELL_TOKEN,
  maxRetries: 3, // Default is 3
  timeoutMs: 10_000,
});

try {
  const result = await client.recall.search("acme/operations", {
    intent: "High-frequency batch transaction reconciliation",
  });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.error(`Exceeded rate limits on endpoint: ${error.door}`);
    console.error(`Suggested retry delay: ${error.retryAfter}s`);
  } else if (error instanceof MemcellError) {
    console.error(`API Refusal (${error.code}):`, error.message);
  } else {
    console.error("Network or unexpected error:", error);
  }
}
```

### Catching `RateLimitError` in Python

```python
from memcell import MemcellClient
from memcell.exceptions import RateLimitError, MemcellError

client = MemcellClient(token="mc_pat_...", max_retries=3, timeout=10.0)

try:
    result = client.recall.search("acme/operations", intent="Batch operation")
except RateLimitError as exc:
    print(f"Rate limited on {exc.door}. Backing off for {exc.retry_after}s")
except MemcellError as exc:
    print(f"API Error ({exc.code}): {exc.message}")
```

---

## Fail-Open vs. Fail-Closed Design in Agent Loops

When integrating MemCell into autonomous agent loops, decide whether your agent should fail-open or fail-closed if memory recall is unreachable:

### Fail-Open Pattern (Recommended for Assistive & Creative Agents)

If memory cannot be reached, the agent proceeds using its baseline model knowledge, logging a warning rather than failing the user's task:

```typescript
async function safeRecall(
  client: MemcellClient,
  namespace: string,
  intent: string,
): Promise<string> {
  try {
    const result = await client.recall.search(namespace, { intent });
    return result.promptContext || "";
  } catch (err) {
    console.warn(
      "[MemCell] Safe recall fallback triggered:",
      (err as Error).message,
    );
    // Proceed with empty context rather than halting the user turn
    return "";
  }
}
```

### Fail-Closed Pattern (Mandatory for High-Stakes Compliance & Finance)

When an agent is executing financial, legal, or data-deletion actions governed by strict guard memories, recall failure must halt execution:

```typescript
async function auditedRecall(
  client: MemcellClient,
  namespace: string,
  intent: string,
): Promise<string> {
  try {
    const result = await client.recall.search(namespace, { intent });
    return result.promptContext;
  } catch (err) {
    // Halt turn to prevent action without mandatory compliance guards
    throw new Error(
      `Compliance Gate Refusal: Unable to verify workspace guards. Reason: ${(err as Error).message}`,
    );
  }
}
```
