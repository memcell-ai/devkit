import type { MemCell } from "./client.js";
import type {
  CollaboratorRole,
  InviteCollaboratorParams,
  ListCollaboratorsParams,
  ListCollaboratorsResponse,
  PendingInvitationItem,
} from "./types.js";

function parseNamespace(namespace: string): { owner: string; project: string } {
  const parts = namespace.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid namespace "${namespace}". Expected format "owner/project" (e.g. "acme/backend").`,
    );
  }
  return {
    owner: encodeURIComponent(parts[0]),
    project: encodeURIComponent(parts[1]),
  };
}

function buildQuery(params?: ListCollaboratorsParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.perPage !== undefined) q.set("per_page", String(params.perPage));
  if (params.role) q.set("role", params.role);
  if (params.affiliation) q.set("affiliation", params.affiliation);
  if (params.q) q.set("q", params.q);

  const str = q.toString();
  return str ? `?${str}` : "";
}

export class CollaboratorsNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists project collaborators and pending invitations.
   */
  async list(
    namespace: string,
    params?: ListCollaboratorsParams,
  ): Promise<ListCollaboratorsResponse> {
    const { owner, project } = parseNamespace(namespace);
    const query = buildQuery(params);
    return await this.client.request<ListCollaboratorsResponse>(
      `/api/v1/${owner}/${project}/collaborators${query}`,
      { method: "GET" },
    );
  }

  /**
   * Invites a new collaborator to the project.
   */
  async invite(
    namespace: string,
    params: InviteCollaboratorParams,
  ): Promise<PendingInvitationItem> {
    const { owner, project } = parseNamespace(namespace);
    const json = await this.client.request<{
      ok: boolean;
      invitation: PendingInvitationItem;
    }>(`/api/v1/${owner}/${project}/collaborators`, {
      method: "POST",
      body: JSON.stringify(params),
    });
    return json.invitation;
  }

  /**
   * Updates a collaborator's access role in the project.
   */
  async updateRole(
    namespace: string,
    userId: string,
    role: CollaboratorRole,
  ): Promise<void> {
    const { owner, project } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(
      `/api/v1/${owner}/${project}/collaborators/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      },
    );
  }

  /**
   * Removes a collaborator from the project.
   */
  async remove(namespace: string, userId: string): Promise<void> {
    const { owner, project } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(
      `/api/v1/${owner}/${project}/collaborators/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Revokes a pending collaborator invitation.
   */
  async revokeInvitation(
    namespace: string,
    invitationId: string,
  ): Promise<void> {
    const { owner, project } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(
      `/api/v1/${owner}/${project}/collaborators/invitations/${encodeURIComponent(invitationId)}`,
      { method: "DELETE" },
    );
  }
}
