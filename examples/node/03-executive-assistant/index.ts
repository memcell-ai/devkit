import { MemcellClient } from "@memcell/sdk";

const token = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/assistant";

const client = new MemcellClient({ token, baseUrl: instance });

async function main() {
  console.log(
    "=== Executive Assistant: Preference Tracking & Revision Lineage ===\n",
  );

  // 1. Ingest a personal preference for the executive
  console.log("1. Saving personal executive preference...");
  const initialTitle =
    "Reserve Friday mornings 9:00 AM - 12:00 PM for deep strategic focus; decline non-urgent meetings";
  const existing = await client.memories.list(namespace, {
    q: "strategic focus",
  });
  let initialPref = existing.items[0];
  if (!initialPref) {
    initialPref = await client.memories.remember(namespace, {
      title: initialTitle,
      type: "preference",
      scope: "user",
      context: "Executive calendar preference for Q1 planning cycle.",
    });
  }
  console.log(
    `[OK] Stored preference [v${initialPref.version}]: ${initialPref.title}\n`,
  );

  // 2. The executive updates their schedule preference later
  console.log("2. Updating preference with new schedule window...");
  const updatedPref = await client.memories.update(namespace, initialPref.id, {
    title:
      "Reserve Friday mornings 8:30 AM - 12:30 PM for strategic focus; schedule meetings only after 1:00 PM",
  });
  console.log(
    `[OK] Updated preference to [v${updatedPref.version}]: ${updatedPref.title}\n`,
  );

  // 3. Inspect the cryptographic version history
  console.log("3. Inspecting memory version lineage...");
  const history = await client.memories.history(namespace, initialPref.id);
  console.log(`[OK] Found ${history.items.length} historical versions.`);
  for (const item of history.items) {
    console.log(
      `  - Version ${item.version}: ${item.changeReason || "revised"}`,
    );
  }

  // 4. Recall preference when scheduling an incoming meeting
  console.log("\n4. Recalling preference for Friday meeting request...");
  const recall = await client.recall({
    namespace,
    intent: "Schedule client strategy sync for Friday at 10:00 AM",
  });

  console.log("Recalled Context for Scheduling Assistant:");
  console.log(recall.promptContext);
}

main().catch(console.error);
