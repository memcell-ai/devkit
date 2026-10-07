import type { MemCell } from "./client.js";
import type {
  AccountProfile,
  PersonalAccessTokenItem,
  UpdateProfileParams,
} from "./types.js";

export interface CreatePersonalTokenParams {
  name: string;
  expiresInDays?: number | null;
}

export interface CreatedPersonalTokenResult {
  id: string;
  name: string;
  token: string;
  preview: string;
  expiresAt: string | null;
  createdAt: string;
}

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
   * Personal Access Tokens management.
   */
  readonly tokens = {
    /**
     * Lists personal access tokens created by the caller.
     */
    list: async (): Promise<PersonalAccessTokenItem[]> => {
      const json = await this.client.request<{
        tokens: PersonalAccessTokenItem[];
      }>("/api/v1/account/tokens", { method: "GET" });
      return json.tokens || [];
    },

    /**
     * Creates a new personal access token. Returns the raw secret token once.
     */
    create: async (
      params: CreatePersonalTokenParams,
    ): Promise<CreatedPersonalTokenResult> => {
      const json = await this.client.request<{
        success: boolean;
        token: CreatedPersonalTokenResult;
      }>("/api/v1/account/tokens", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return json.token;
    },

    /**
     * Revokes a personal access token by ID.
     */
    revoke: async (tokenId: string): Promise<void> => {
      await this.client.request<{ success: boolean }>(
        `/api/v1/account/tokens/${encodeURIComponent(tokenId)}`,
        { method: "DELETE" },
      );
    },
  };
}
