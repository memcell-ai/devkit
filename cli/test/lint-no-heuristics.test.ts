import { describe, expect, it } from "vitest";
import { lintAllSources, lintSourceCode } from "../../scripts/lint-no-heuristics.mjs";

describe("lint-no-heuristics AST enforcement", () => {
  it("verifies zero regex literals, RegExp constructors, or heuristic tables in cli/src and sdks/node/src", () => {
    const violations = lintAllSources();
    expect(violations).toEqual([]);
  });

  it("rejects regex literals, RegExp constructors, charCodeAt loops, and banned heuristic tables", () => {
    const sample = [
      "const p = " + "/abc/g;",
      'const r = new RegExp("abc");',
      'const GUARD_PHRASES = ["never", "must not"];',
      'const code = "a".charCodeAt(0);',
      'const STOP_WORDS = new Set(["the", "is"]);',
    ].join("\n");

    const violations = lintSourceCode(sample, "sample.ts");
    expect(violations).toHaveLength(5);
    expect(violations[0]?.message).toContain("Regular expression literal");
    expect(violations[1]?.message).toContain("RegExp constructor");
    expect(violations[2]?.message).toContain("GUARD_PHRASES");
    expect(violations[3]?.message).toContain("charCodeAt");
    expect(violations[4]?.message).toContain("STOP_WORDS");
  });
});
