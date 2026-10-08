import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestEnvironment, type TestEnvironment } from "./test-helpers.js";

describe("CLI Account & Tokens E2E", () => {
  let env: TestEnvironment | null = null;
  let mintedTokenId: string | undefined;

  beforeAll(async () => {
    // We don't need a disposable workspace for account level operations
    env = await setupTestEnvironment("account", { createWorkspace: false });
    if (!env) {
      console.warn(
        "[e2e] Backend not reachable or no auth credentials. Skipping account tokens suite.",
      );
    }
  });

  afterAll(() => {
    if (env) {
      if (mintedTokenId) {
        env.runCli(
          [
            "account",
            "token",
            "revoke",
            mintedTokenId,
            "--url",
            env.instanceUrl,
          ],
          {
            allowFailure: true,
          },
        );
      }
      env.cleanup();
    }
  });

  it("retrieves personal account profile and identity information", () => {
    if (!env) return;

    const res = env.runCli(["account", "profile", "--url", env.instanceUrl]);
    expect(res.stdout).toMatch(/account/i);
    expect(res.stdout).toMatch(/member since|user/i);
  });

  it("mints a new Personal Access Token via account token create", () => {
    if (!env) return;

    const tokenName = `E2E-PAT-${Math.random().toString(36).slice(2, 8)}`;
    const res = env.runCli([
      "account",
      "token",
      "create",
      tokenName,
      "--expires",
      "30",
      "--url",
      env.instanceUrl,
    ]);

    expect(res.stdout).toMatch(/created token/i);
    expect(res.stdout).toContain(tokenName);
    expect(res.stdout).toMatch(/token:\s*mc_pat_/i);

    const lines = res.stdout.split("\n").map((l) => l.trim());
    mintedTokenId =
      lines.find((l) => /^pat_[0-9a-f]{24}$/i.test(l)) ||
      res.stdout.match(/(pat_[0-9a-f]{24})/i)?.[1];
    expect(mintedTokenId).toBeDefined();
  });

  it("lists account tokens and confirms presence of the minted token", () => {
    if (!env || !mintedTokenId) return;

    const res = env.runCli([
      "account",
      "token",
      "list",
      "--url",
      env.instanceUrl,
    ]);
    expect(res.stdout).toContain(mintedTokenId);
  });

  it("revokes the personal access token via account token revoke", () => {
    if (!env || !mintedTokenId) return;

    const res = env.runCli([
      "account",
      "token",
      "revoke",
      mintedTokenId,
      "--url",
      env.instanceUrl,
    ]);
    expect(res.stdout).toMatch(/revoked/i);
  });

  it("confirms revoked token is absent from the token list", () => {
    if (!env || !mintedTokenId) return;

    const res = env.runCli([
      "account",
      "token",
      "list",
      "--url",
      env.instanceUrl,
    ]);
    expect(res.stdout).not.toContain(mintedTokenId);
  });
});
