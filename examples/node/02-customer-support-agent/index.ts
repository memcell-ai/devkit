import { MemCell } from "@memcell/sdk";

const token = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/support";

const client = new MemCell({ token, baseUrl: instance });
const support = client.scope(namespace, { subject: "billing-support-triage" });

interface SupportTicket {
  id: string;
  customerName: string;
  priority: "low" | "medium" | "high" | "urgent";
  message: string;
}

async function setupWorkspacePolicies() {
  console.log("Seeding baseline support workspace memories...");

  // Enforced policy instruction: Refund authorization threshold
  await support.remember({
    title:
      "Direct agent refunds over $200 require tier-2 supervisory confirmation",
    type: "instruction",
    scope: "workspace",
    enforce: true,
    appliesAt: ["refund", "billing"],
  });

  // Operational instruction: Response SLA
  await support.remember({
    title:
      "Urgent tickets must be acknowledged within 5 minutes with incident ticket ID",
    type: "instruction",
    scope: "workspace",
  });
}

async function processSupportTicket(ticket: SupportTicket) {
  console.log(
    `\n--- Processing Ticket: ${ticket.id} (${ticket.customerName}) ---`,
  );
  console.log(`Customer Message: "${ticket.message}"`);

  // Closed-loop execution: recalls enforced instructions, executes triage, and reports outcome
  const execution = await support.wrapExecution(
    {
      action: `triage_ticket_${ticket.id.toLowerCase()}`,
      query: `Handle customer support ticket: ${ticket.message}`,
      minConfidence: 0.7,
      externalRef: ticket.id,
    },
    async (ctx) => {
      console.log(`\n[Recalled ${ctx.memories.length} policy instructions]`);
      console.log(ctx.promptContext || "(No specific instructions matched)");

      const enforcedRule = ctx.memories.find(
        (m) => m.type === "instruction" && m.enforce,
      );

      if (enforcedRule && ticket.message.toLowerCase().includes("refund")) {
        console.log(
          `\n[Action]: Escalating to Human Tier-2 Lead per enforced instruction [${enforcedRule.id}].`,
        );
        return { status: "ESCALATED_TIER_2", ruleId: enforcedRule.id };
      }

      console.log("\n[Action]: Automated triage resolution dispatched.");
      return { status: "RESOLVED_AUTO", ruleId: null };
    },
  );

  console.log(
    `[Outcome Reported]: '${execution.report.outcome}' (decision=${execution.result.status})`,
  );
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

main().catch((err) => {
  console.error("Support agent error:", err);
  process.exit(1);
});
