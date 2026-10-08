import { MemcellClient } from "@memcell/sdk";

const token = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/support";

const client = new MemcellClient({ token, baseUrl: instance });

interface SupportTicket {
  id: string;
  customerName: string;
  priority: "low" | "medium" | "high" | "urgent";
  message: string;
}

async function processSupportTicket(ticket: SupportTicket) {
  console.log(
    `\n--- Processing Ticket: ${ticket.id} (${ticket.customerName}) ---`,
  );
  console.log(`Customer Message: "${ticket.message}"`);

  // Recall workspace policies and guard constraints relevant to this ticket
  const recall = await client.recall.search(namespace, {
    intent: `Handle customer support ticket: ${ticket.message}`,
    minConfidence: 0.7,
  });

  console.log(`\n[Recalled ${recall.memories.length} policy directives]`);
  console.log(recall.promptContext || "(No specific directives matched)");

  // Simulated agent evaluation against recalled guard directives
  const hasGuard = recall.memories.some((m) => m.type === "guard" && m.enforce);
  if (hasGuard && ticket.message.toLowerCase().includes("refund")) {
    console.log(
      "\n[Action]: Escalating to Human Tier-2 Lead per workspace guard memory.",
    );
    // Report outcome
    const guardMem = recall.memories.find((m) => m.type === "guard");
    if (guardMem) {
      await client.report(namespace, {
        memoryId: guardMem.id,
        outcome: "upheld",
        reason: `Enforced supervisor escalation on high-value refund for ticket ${ticket.id}`,
      });
    }
  } else {
    console.log("\n[Action]: Automated triage resolution dispatched.");
  }
}

async function setupWorkspacePolicies() {
  console.log("Seeding baseline support workspace memories...");

  // Guard policy: Refund authorization
  await client.memories.remember(namespace, {
    title:
      "Direct agent refunds over $200 require tier-2 supervisory confirmation",
    type: "guard",
    scope: "workspace",
    enforce: true,
  });

  // Operational directive: Response SLA
  await client.memories.remember(namespace, {
    title:
      "Urgent tickets must be acknowledged within 5 minutes with incident ticket ID",
    type: "directive",
    scope: "workspace",
  });
}

async function main() {
  await setupWorkspacePolicies();

  const ticket1: SupportTicket = {
    id: "TCK-101",
    customerName: "Jane Doe",
    priority: "high",
    message:
      "I was billed twice for subscription and require an immediate $350 refund.",
  };

  const ticket2: SupportTicket = {
    id: "TCK-102",
    customerName: "Bob Smith",
    priority: "low",
    message: "How do I update my profile avatar?",
  };

  await processSupportTicket(ticket1);
  await processSupportTicket(ticket2);
}

main().catch(console.error);
