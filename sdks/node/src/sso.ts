import type { MemCell } from "./client.js";
import type {
  ConfigureSSOInput,
  OrganizationSSOResult,
  SSODomainLookupResult,
  SSOProviderSummary,
  SSOVerificationToken,
} from "./types.js";

/**
 * Enterprise Single Sign-On (SSO) and Identity Provider operations.
 */
export class OrganizationSsoNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Fetches all configured SSO providers and enforcement status for an organization.
   */
  async get(orgSlug: string): Promise<OrganizationSSOResult> {
    return await this.client.request<OrganizationSSOResult>(
      `/api/v1/organizations/${encodeURIComponent(orgSlug)}/sso`,
      { method: "GET" },
    );
  }

  /**
   * Configures or updates an SAML 2.0 or OIDC identity provider for an organization.
   */
  async configure(
    orgSlug: string,
    input: ConfigureSSOInput,
  ): Promise<SSOProviderSummary> {
    const json = await this.client.request<{
      ok: boolean;
      provider: SSOProviderSummary;
    }>(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/sso`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return json.provider;
  }

  /**
   * Deletes an SSO connection by its provider ID.
   */
  async delete(orgSlug: string, providerId: string): Promise<void> {
    await this.client.request<{ ok: boolean }>(
      `/api/v1/organizations/${encodeURIComponent(orgSlug)}/sso?providerId=${encodeURIComponent(providerId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Generates or retrieves the DNS TXT verification token for a provider domain.
   */
  async getVerificationToken(
    orgSlug: string,
    providerId: string,
  ): Promise<SSOVerificationToken> {
    return await this.client.request<SSOVerificationToken>(
      `/api/v1/organizations/${encodeURIComponent(orgSlug)}/sso/token`,
      {
        method: "POST",
        body: JSON.stringify({ providerId }),
      },
    );
  }

  /**
   * Triggers DNS resolution to verify ownership of a provider's configured domain.
   */
  async verifyDomain(
    orgSlug: string,
    providerId: string,
  ): Promise<{ ok: boolean; verified: boolean }> {
    return await this.client.request<{ ok: boolean; verified: boolean }>(
      `/api/v1/organizations/${encodeURIComponent(orgSlug)}/sso/verify-domain`,
      {
        method: "POST",
        body: JSON.stringify({ providerId }),
      },
    );
  }

  /**
   * Enables or disables strict SSO enforcement for all verified domains of an organization.
   */
  async setEnforcement(
    orgSlug: string,
    ssoEnforced: boolean,
  ): Promise<{ ok: boolean; ssoEnforced: boolean }> {
    return await this.client.request<{ ok: boolean; ssoEnforced: boolean }>(
      `/api/v1/organizations/${encodeURIComponent(orgSlug)}/sso/enforce`,
      {
        method: "PATCH",
        body: JSON.stringify({ ssoEnforced }),
      },
    );
  }

  /**
   * Public discovery endpoint to lookup if a domain or email requires SSO authentication.
   */
  async lookup(domainOrEmail: string): Promise<SSODomainLookupResult> {
    const isEmail = domainOrEmail.includes("@");
    const param = isEmail ? "email" : "domain";
    return await this.client.request<SSODomainLookupResult>(
      `/api/v1/auth/sso/lookup?${param}=${encodeURIComponent(domainOrEmail)}`,
      { method: "GET" },
    );
  }
}

/**
 * Scoped handle for SSO operations bound to a specific organization.
 */
export class ScopedOrganizationSso {
  constructor(
    private readonly ssoNamespace: OrganizationSsoNamespace,
    readonly orgSlug: string,
  ) {}

  /**
   * Fetches configured SSO providers and enforcement status for this organization.
   */
  async get(): Promise<OrganizationSSOResult> {
    return await this.ssoNamespace.get(this.orgSlug);
  }

  /**
   * Configures a SAML 2.0 or OIDC identity provider for this organization.
   */
  async configure(input: ConfigureSSOInput): Promise<SSOProviderSummary> {
    return await this.ssoNamespace.configure(this.orgSlug, input);
  }

  /**
   * Deletes an SSO connection for this organization.
   */
  async delete(providerId: string): Promise<void> {
    await this.ssoNamespace.delete(this.orgSlug, providerId);
  }

  /**
   * Generates or retrieves the DNS TXT verification token for a provider domain.
   */
  async getVerificationToken(
    providerId: string,
  ): Promise<SSOVerificationToken> {
    return await this.ssoNamespace.getVerificationToken(
      this.orgSlug,
      providerId,
    );
  }

  /**
   * Triggers DNS resolution to verify domain ownership.
   */
  async verifyDomain(
    providerId: string,
  ): Promise<{ ok: boolean; verified: boolean }> {
    return await this.ssoNamespace.verifyDomain(this.orgSlug, providerId);
  }

  /**
   * Toggles strict SSO enforcement for this organization.
   */
  async setEnforcement(
    ssoEnforced: boolean,
  ): Promise<{ ok: boolean; ssoEnforced: boolean }> {
    return await this.ssoNamespace.setEnforcement(this.orgSlug, ssoEnforced);
  }
}
