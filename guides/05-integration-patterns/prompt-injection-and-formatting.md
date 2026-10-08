# Prompt Injection & Context Formatting

When an agent queries MemCell via `recall.search`, the response contains structured memory objects alongside a ready-to-use, token-optimized **`promptContext`** string.

Understanding how to inject this context into your LLM's conversation loop is essential for maximizing instruction adherence while conserving token budgets.

---

## Anatomy of `promptContext`

MemCell does not simply concatenate raw database strings. Its recall engine synthesizes memories with high epistemic density:

```
[MemCell Epistemic Directives]
• [Guard] Escalate any outbound payment exceeding $10,000 to a compliance supervisor (enforced).
• [Directive] Format transaction logs with ISO-8601 timestamps and ISO-4217 currency symbols.
• [Preference] Address clients by formal honorific unless prior correspondence indicates first-name basis.
```

- **Clear Epistemic Markers**: Directives and guards are highlighted clearly for the LLM.
- **Guards Prioritized**: Enforced guard constraints are ordered prominently at the top.
- **Token Pruning**: Redundant phrases, metadata, and lower-confidence noise are stripped out.

---

## Recommended Injection Patterns

### Pattern A: Dedicated Epistemic Section in System Prompt (Recommended)

Placing the `promptContext` inside the system message provides the highest instruction adherence across major frontier models (Anthropic Claude, OpenAI GPT-4o, Google Gemini):

```typescript
import { MemcellClient } from "@memcell/sdk";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const client = new MemcellClient({ token: process.env.MEMCELL_TOKEN });

async function executeAgentTurn(userMessage: string) {
  // 1. Recall dynamic context matching user message intent
  const recallResult = await client.recall.search("acme/support", {
    intent: userMessage,
  });

  // 2. Synthesize system prompt
  const systemPrompt = [
    "You are an enterprise customer operations assistant.",
    "Follow your baseline tone and capabilities.",
    "",
    recallResult.promptContext ? recallResult.promptContext : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // 3. Dispatch to LLM
  const response = await generateText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    prompt: userMessage,
  });

  return response.text;
}
```

### Pattern B: Prefixing User Turn in Tool/Agent Loops

In agent harnesses where the system prompt is static or cached, inject the recalled context immediately preceding the user turn:

```python
from memcell import MemcellClient
from openai import OpenAI

client = MemcellClient(token="mc_pat_...")
openai_client = OpenAI()

def run_agent_turn(user_input: str):
    # 1. Recall
    recall = client.recall.search("acme/support", intent=user_input)

    # 2. Augment user message
    augmented_message = user_input
    if recall.prompt_context:
        augmented_message = f"{recall.prompt_context}\n\nTask: {user_input}"

    # 3. Call LLM
    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a customer support agent."},
            {"role": "user", "content": augmented_message},
        ]
    )
    return response.choices[0].message.content
```

---

## Key Guidelines

1. **Do Not Re-Format Manually**: `promptContext` is pre-engineered and benchmarked for model compliance. Inject it directly rather than iterating over `memories` array to re-create prompt strings.
2. **Handle Empty Context Gracefully**: When a workspace is cold or no memories match the intent, `promptContext` will be an empty string `""`. Ensure your prompt template safely omits empty blocks.
3. **Report the Outcome**: When the turn succeeds or fails, pass the recalled memory IDs back to `client.report` to reinforce valid memories.
