import type { MemCell } from "./client.js";
import type { InvitationItem } from "./types.js";

export class InvitationsNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Fetches details of a specific pending invitation.
   */
  async get(invitationId: string): Promise<InvitationItem> {
    const json = await this.client.request<{
      ok: boolean;
      invitation: InvitationItem;
    }>(`/api/v1/invitations/${encodeURIComponent(invitationId)}`, {
      method: "GET",
    });
    return json.invitation;
  }

  /**
   * Accepts a pending organization or workspace invitation.
   */
  async accept(
    invitationId: string,
  ): Promise<{ ok: boolean; organizationSlug?: string }> {
    return await this.client.request<{
      ok: boolean;
      organizationSlug?: string;
    }>(`/api/v1/invitations/${encodeURIComponent(invitationId)}/accept`, {
      method: "POST",
    });
  }

  /**
   * Declines a pending invitation.
   */
  async decline(invitationId: string): Promise<{ ok: boolean }> {
    return await this.client.request<{ ok: boolean }>(
      `/api/v1/invitations/${encodeURIComponent(invitationId)}/decline`,
      { method: "POST" },
    );
  }
}
