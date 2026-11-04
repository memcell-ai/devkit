import { describe, expect, it } from "vitest";

import { claude } from "../src/adapters/claude.js";
import { gemini } from "../src/adapters/gemini.js";

const heard = { prompt: "how do refunds work?", hookEventName: "UserPromptSubmit" };

describe("a notice for the person, kept out of the model's context", () => {
  it("rides Claude Code's systemMessage beside what the model reads", () => {
    const spoken = JSON.parse(claude.speak("prompt-submit", "recalled", heard, "invite someone")!);

    expect(spoken.systemMessage).toBe("invite someone");
    expect(spoken.hookSpecificOutput.additionalContext).toBe("recalled");
    expect(spoken.hookSpecificOutput.additionalContext).not.toContain("invite someone");
  });

  it("is said on its own when there is nothing for the model", () => {
    expect(JSON.parse(claude.speak("session-start", null, heard, "invite someone")!)).toEqual({
      systemMessage: "invite someone",
    });
  });

  it("is never said at a moment the harness does not show it", () => {
    const spoken = JSON.parse(claude.speak("before-act", "recalled", heard, "invite someone")!);

    expect(spoken.systemMessage).toBeUndefined();
    expect(claude.speak("before-act", null, heard, "invite someone")).toBeNull();
  });

  it("only rides Gemini CLI at session start, where its docs say it is shown", () => {
    expect(JSON.parse(gemini.speak("session-start", null, {}, "invite someone")!)).toEqual({
      systemMessage: "invite someone",
    });
    expect(gemini.speak("prompt-submit", null, {}, "invite someone")).toBeNull();
  });
});
