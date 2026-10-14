import type { MemCell } from "./client.js";
import type {
  AccountProfile,
  ApiKeyItem,
  PersonalAccessTokenItem,
  UpdateProfileParams,
} from "./types.js";

export interface CreateApiKeyParams {
  name: string;
  expiresInDays?: number | null;
}

export type CreatePersonalTokenParams = CreateApiKeyParams;

export interface CreatedApiKeyResult {
  id: string;
  name: string;
  key: string;
  token: string;
  preview: string;
  prefix: string;
  expiresAt: string | null;
  createdAt: string;
}

export type CreatedPersonalTokenResult = CreatedApiKeyResult;

export class AccountNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Fetches the profile of the authenticated caller.
   */
  async get(): Promise<AccountProfile> {
    const json = await this.client.request<{ profile: AccountProfile }>(
      "/api/v1/account/profile",
      { method: "GET" },
    );
    return json.profile;
  }

  /**
   * Updates the authenticated caller's profile.
   */
  async updateProfile(params: UpdateProfileParams): Promise<AccountProfile> {
    const json = await this.client.request<{
      success: boolean;
      profile: AccountProfile;
    }>("/api/v1/account/profile", {
      method: "PATCH",
      body: JSON.stringify(params),
    });
    return json.profile;
  }

  /**
   * API Keys management.
   */
  readonly apiKeys = {
    /**
     * Lists API keys created by the caller.
     */
    list: async (): Promise<ApiKeyItem[]> => {
      const json = await this.client.request<{
        keys?: ApiKeyItem[];
        tokens?: ApiKeyItem[];
      }>("/api/v1/account/api-keys", { method: "GET" });
      return json.keys || json.tokens || [];
    },

    /**
     * Creates a new API key. Returns the raw secret key once.
     */
    create: async (
      params: CreateApiKeyParams,
    ): Promise<CreatedApiKeyResult> => {
      const json = await this.client.request<{
        success: boolean;
        key?: any;
        token?: any;
      }>("/api/v1/account/api-keys", {
        method: "POST",
        body: JSON.stringify(params),
      });
      const raw = json.key || json.token || {};
      const keyVal = raw.rawKey || raw.rawToken || raw.key || raw.token || "";
      const prefixVal = raw.prefix || raw.preview || "";
      return {
        id: raw.id,
        name: raw.name,
        key: keyVal,
        token: keyVal,
        preview: prefixVal,
        prefix: prefixVal,
        expiresAt: raw.expiresAt ?? null,
        createdAt: raw.createdAt || new Date().toISOString(),
      };
    },

    /**
     * Revokes an API key by ID.
     */
    revoke: async (keyId: string): Promise<void> => {
      await this.client.request<{ success: boolean }>(
        `/api/v1/account/api-keys/${encodeURIComponent(keyId)}`,
        { method: "DELETE" },
      );
    },
  };

  /**
   * Legacy alias for apiKeys.
   */
  readonly tokens = this.apiKeys;
}
