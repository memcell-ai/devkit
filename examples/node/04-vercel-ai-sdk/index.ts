import { MemcellClient } from "@memcell/sdk";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const token = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/operations";

const client = new MemcellClient({ token, baseUrl: instance });

async function askAgent(userPrompt: string) {
  console.log(`User Query: "${userPrompt}"`);

  // 1. Recall dynamic context from MemCell
  const recallResult = await client.recall.search(namespace, {
    intent: userPrompt,
    minConfidence: 0.7,
  });

  // 2. Build model prompt with synthesized context
  const systemPrompt = [
    "You are an operations assistant adhering strictly to company directives.",
    recallResult.promptContext ? `\n${recallResult.promptContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  console.log("\n[Injected Context]:");
  console.log(recallResult.promptContext || "(No memories retrieved)");

  // 3. Generate text using Vercel AI SDK
  if (!process.env.OPENAI_API_KEY) {
    console.log(
      "\n[Notice]: Set OPENAI_API_KEY to execute real LLM completion.",
    );
    console.log("Simulating response based on context...\n");
    return;
  }

  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    prompt: userPrompt,
  });

  console.log("\nAgent Response:");
  console.log(text);
}

async function main() {
  await client.memories.remember(namespace, {
    title:
      "All financial reports must specify amounts in USD and include variance percentages",
    type: "directive",
    scope: "workspace",
  });

  await askAgent("Generate a summary of Q3 regional sales performance");
}

main().catch(console.error);
