import { MemCell } from "@memcell/sdk";
import {
  createMemCellMiddleware,
  createMemCellTools,
  withMemCellVercelTurn,
} from "@memcell/sdk/vercel";

const token = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/operations";

const client = new MemCell({ token, baseUrl: instance });
const ops = client.scope(namespace, { subject: "quarterly-financial-reporting" });

async function main() {
  console.log("=== MemCell + Vercel AI SDK Native Integration ===\n");

  // 1. Seed a standing instruction and a grounded reference document
  await ops.remember({
    title:
      "All financial reports must specify amounts in USD and include YoY variance percentages",
    type: "instruction",
    scope: "workspace",
    enforce: true,
  });

  await ops.documents.ingest({
    title: "Q3 Regional Revenue Ledger",
    content:
      "# Q3 Revenue Summary\nNorth America: $4.2M (+18% YoY). EMEA: $2.9M (+11% YoY).",
    distill: false,
  });

  // 2. Native LanguageModel Middleware (`wrapLanguageModel` compatible)
  console.log("1. Running Vercel AI SDK LanguageModel Middleware...");
  const middleware = createMemCellMiddleware(ops, {
    action: "generate_q3_summary",
    minConfidence: 0.7,
  });

  // Middleware automatically recalls workspace memories and injects them into the system prompt
  const transformedParams = await middleware.transformParams({
    params: {
      prompt: [
        {
          role: "system",
          content: "You are an operations financial analyst.",
        },
        {
          role: "user",
          content: "Generate a summary of Q3 regional sales performance",
        },
      ],
    },
  });

  console.log("\n[Middleware Injected System Prompt]:");
  console.log(transformedParams.prompt?.[0]?.content);

  // `wrapGenerate` executes the model call and automatically reports `outcome: "worked"`
  const generation = await middleware.wrapGenerate({
    params: transformedParams,
    doGenerate: async () => ({
      text: "Q3 Sales Summary (USD): North America reached $4.20M (+18.0% YoY variance) and EMEA reached $2.90M (+11.0% YoY variance).",
    }),
  });
  console.log("\n[Model Output]:", generation.text);

  // 3. Native Vercel AI SDK Tools (`recall_memory`, `remember_memory`, `report_outcome`, `search_documents`)
  console.log("\n2. Invoking MemCell Vercel AI SDK Tools (`createMemCellTools`)...");
  const tools = createMemCellTools(ops);

  const docSearch = await tools.search_documents.execute({
    query: "Q3 North America and EMEA revenue",
    limit: 2,
  });
  console.log(
    `   [Tool: search_documents] Retrieved ${docSearch.chunks.length} grounded chunk(s): "${docSearch.chunks[0]?.content}"`,
  );

  const savedDecision = await tools.remember_memory.execute({
    title: "Q3 EMEA variance exceeded forecast due to enterprise renewals",
    type: "decision",
    enforce: false,
  });
  console.log(
    `   [Tool: remember_memory] Persisted decision [${savedDecision.created[0]?.id}]`,
  );

  // 4. Turn-level wrapper (`withMemCellVercelTurn`)
  const turn = await withMemCellVercelTurn(
    ops,
    {
      action: "finalize_exec_brief",
      query: "Formatting rules for executive Q3 sales brief",
    },
    async (ctx) => {
      return `Brief verified against ${ctx.memories.length} active memories (recallId=${ctx.recallId}).`;
    },
  );
  console.log(`\n3. [Closed-Loop Turn]: ${turn.result}`);
}

main().catch((err) => {
  console.error("Vercel integration error:", err);
  process.exit(1);
});
