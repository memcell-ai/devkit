import { describe, expect, it, vi } from "vitest";
import { MemCell } from "../src/client.js";

describe("Enterprise SSO & Identity Federation SDK", () => {
  it("fetches organization SSO providers and enforcement state", async () => {
    const recorded: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        recorded.push({ method, url: u, body });

        if (method === "GET" && u.includes("/api/v1/organizations/acme/sso")) {
          return new Response(
            JSON.stringify({
              ok: true,
              providers: [
                {
                  id: "prov-1",
                  providerId: "sso-acme-corp",
                  domain: "acme.corp",
                  issuer: "https://login.okta.com/oauth2/default",
                  protocol: "saml",
                  domainVerified: true,
                  organizationId: "org-1",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
              ssoEnforced: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const res = await memcell.organizations.sso.get("acme");

    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.method).toBe("GET");
    expect(recorded[0]!.url).toContain("/api/v1/organizations/acme/sso");
    expect(res.providers).toHaveLength(1);
    expect(res.providers[0]!.domain).toBe("acme.corp");
    expect(res.ssoEnforced).toBe(true);
  });

  it("configures a SAML 2.0 provider via client.organizations.sso.configure", async () => {
    const recorded: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        recorded.push({ method, url: u, body });

        if (method === "POST" && u.includes("/api/v1/organizations/acme/sso")) {
          return new Response(
            JSON.stringify({
              ok: true,
              provider: {
                id: "prov-new",
                providerId: "sso-acme-saml",
                domain: "acme.corp",
                issuer: "https://idp.acme.corp",
                protocol: "saml",
                domainVerified: false,
                organizationId: "org-1",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const provider = await memcell.organizations.sso.configure("acme", {
      domain: "acme.corp",
      issuer: "https://idp.acme.corp",
      protocol: "saml",
      samlConfig: {
        entryPoint: "https://idp.acme.corp/sso",
      },
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.method).toBe("POST");
    expect(recorded[0]!.body.domain).toBe("acme.corp");
    expect(provider.id).toBe("prov-new");
    expect(provider.domainVerified).toBe(false);
  });

  it("retrieves DNS verification token and performs verification", async () => {
    const recorded: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        recorded.push({ method, url: u, body });

        if (u.includes("/api/v1/organizations/acme/sso/token")) {
          return new Response(
            JSON.stringify({
              token: "dns_token_abc",
              dnsRecordName: "_better-auth-token-sso-1.acme.corp",
              dnsRecordType: "TXT",
              domain: "acme.corp",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (u.includes("/api/v1/organizations/acme/sso/verify-domain")) {
          return new Response(
            JSON.stringify({
              ok: true,
              verified: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const tokenInfo = await memcell.organizations.sso.getVerificationToken(
      "acme",
      "sso-1",
    );
    expect(tokenInfo.token).toBe("dns_token_abc");
    expect(tokenInfo.dnsRecordName).toBe("_better-auth-token-sso-1.acme.corp");

    const verifyRes = await memcell.organizations.sso.verifyDomain(
      "acme",
      "sso-1",
    );
    expect(verifyRes.verified).toBe(true);
  });

  it("updates enforcement and supports scoped organization handle", async () => {
    const recorded: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        recorded.push({ method, url: u, body });

        if (
          method === "PATCH" &&
          u.includes("/api/v1/organizations/acme/sso/enforce")
        ) {
          return new Response(
            JSON.stringify({
              ok: true,
              ssoEnforced: body.ssoEnforced,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const acmeOrg = memcell.forOrg("acme");

    const res = await acmeOrg.sso.setEnforcement(true);
    expect(res.ssoEnforced).toBe(true);
    expect(recorded[0]!.body.ssoEnforced).toBe(true);
  });

  it("performs domain discovery lookup via client.organizations.sso.lookup", async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/api/v1/auth/sso/lookup?email=user%40acme.corp")) {
        return new Response(
          JSON.stringify({
            ssoAvailable: true,
            providerId: "sso-acme-corp",
            organizationSlug: "acme",
            organizationName: "Acme Corporation",
            ssoEnforced: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const result = await memcell.organizations.sso.lookup("user@acme.corp");

    expect(result.ssoAvailable).toBe(true);
    expect(result.ssoEnforced).toBe(true);
    expect(result.organizationName).toBe("Acme Corporation");
  });
});
