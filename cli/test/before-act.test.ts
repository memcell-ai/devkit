import { describe, expect, it } from "vitest";

import { actOf, actsOf } from "../src/loop/act.js";
import { evaluatePreAct, stageMemoriesFromRecall } from "../src/loop/pre-act.js";
import { SURFACE } from "../src/adapters/claude.js";
import { can } from "../src/adapters/surface.js";

const guard = (() => {
  if (!can(SURFACE.guard)) throw new Error("claude code documents PreToolUse");
  return SURFACE.guard;
})();

describe("naming the act", () => {
  it("resolves a tool that maps to a single act class off its declarative adapter table", () => {
    expect(actOf("Read", {}, guard)).toBe("read");
    expect(actOf("Grep", {}, guard)).toBe("read");
    expect(actOf("Write", {}, guard)).toBe("change");
    expect(actOf("Edit", {}, guard)).toBe("change");
  });

  it("returns all declared act classes for multi-act tools via actsOf without hardcoded command lists", () => {
    expect(actsOf("Bash", guard)).toEqual(["read", "change", "record", "send"]);
    // actOf returns null for multi-act tools so pre-act evaluation matches against structured memory resources/tokens
    expect(actOf("Bash", { command: "git push origin main" }, guard)).toBeNull();
    expect(actOf("SomeToolNobodyDeclared", {}, guard)).toBeNull();
  });

  it("evaluates multi-act tools against structured memory resources and tokens", () => {
    const activeMemories = stageMemoriesFromRecall(
      [
        {
          id: "mem-prod-db",
          title: "Never drop or truncate production tables",
          type: "guard",
          resources: ["prod_users", "production.db"],
          appliesAt: ["change", "send"],
          confidence: 0.99,
        },
      ],
      "strict",
    );

    const refused = evaluatePreAct({
      tool: "Bash",
      input: { command: "sqlite3 production.db 'DROP TABLE prod_users;'" },
      guard,
      activeMemories,
    });
    expect(refused.verdict).toBe("refuse");

    const allowed = evaluatePreAct({
      tool: "Bash",
      input: { command: "npm test" },
      guard,
      activeMemories,
    });
    expect(allowed.verdict).toBe("pass");
  });
});

describe("what the record is allowed to know", () => {
  it("never learns a tool name", () => {
    const allowedWords = ["read", "change", "record", "send", "answer"];
    const classes = Object.keys(guard.tools);
    for (const word of classes) {
      expect(allowedWords).toContain(word);
    }
  });
});
