import type { MemCell } from "./client.js";
import type { ScopedMemCell } from "./scoped.js";
import type {
  CreateOrganizationParams,
  FeedbackParams,
  FeedbackResponse,
  InviteMemberParams,
  ListMembersParams,
  OrganizationItem,
  OrgInvitationItem,
  OrgMemberItem,
  OrgRole,
  PaginatedResult,
  RecallParams,
  RecallResponse,
  RememberParams,
  RememberResponse,
  ReportParams,
  ReportResponse,
  ScopeOptions,
  UpdateOrganizationParams,
} from "./types.js";

function buildMembersQuery(params?: ListMembersParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.perPage !== undefined) q.set("per_page", String(params.perPage));
  if (params.role) q.set("role", params.role);
  if (params.q) q.set("q", params.q);
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);

  const str = q.toString();
  return str ? `?${str}` : "";
}

export class OrganizationsNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists organizations the authenticated user belongs to.
   */
  async list(): Promise<OrganizationItem[]> {
    const json = await this.client.request<{
      ok: boolean;
      organizations: OrganizationItem[];
    }>("/api/v1/organizations", { method: "GET" });
    return json.organizations || [];
  }

  /**
   * Creates a new organization with the caller as owner.
   */
  async create(params: CreateOrganizationParams): Promise<OrganizationItem> {
    const json = await this.client.request<{
      ok: boolean;
      organization: OrganizationItem;
    }>("/api/v1/organizations", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return json.organization;
  }

  /**
   * Fetches details of an organization by its slug handle.
   */
  async get(slug: string): Promise<OrganizationItem> {
    const json = await this.client.request<{
      ok: boolean;
      organization: OrganizationItem;
    }>(`/api/v1/organizations/${encodeURIComponent(slug)}`, {
      method: "GET",
    });
    return json.organization;
  }

  /**
   * Updates organization profile information and settings.
   */
  async update(
    slug: string,
    params: UpdateOrganizationParams,
  ): Promise<OrganizationItem> {
    const json = await this.client.request<{
      ok: boolean;
      organization: OrganizationItem;
    }>(`/api/v1/organizations/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
    return json.organization;
  }

  /**
   * Deletes an organization.
   */
  async delete(slug: string): Promise<void> {
    await this.client.request<{ ok: boolean }>(
      `/api/v1/organizations/${encodeURIComponent(slug)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ confirmSlug: slug }),
      },
    );
  }

  /**
   * Lists members of an organization with pagination and filters.
   */
  async listMembers(
    slug: string,
    params?: ListMembersParams,
  ): Promise<PaginatedResult<OrgMemberItem>> {
    const query = buildMembersQuery(params);
    const json = await this.client.request<{
      ok: boolean;
      members: OrgMemberItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/organizations/${encodeURIComponent(slug)}/members${query}`, {
      method: "GET",
    });

    return {
      items: json.members || [],
      pagination: json.pagination,
    };
  }

  /**
   * Updates an organization member's role.
   */
  async updateMemberRole(
    slug: string,
    userId: string,
    role: OrgRole,
  ): Promise<void> {
    await this.client.request<{ ok: boolean }>(
      `/api/v1/organizations/${encodeURIComponent(slug)}/members`,
      {
        method: "PATCH",
        body: JSON.stringify({ userId, role }),
      },
    );
  }

  /**
   * Removes a member from an organization.
   */
  async removeMember(slug: string, userId: string): Promise<void> {
    await this.client.request<{ ok: boolean }>(
      `/api/v1/organizations/${encodeURIComponent(slug)}/members?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Lists pending invitations for an organization.
   */
  async listInvitations(slug: string): Promise<OrgInvitationItem[]> {
    const json = await this.client.request<{
      ok: boolean;
      invitations: OrgInvitationItem[];
    }>(`/api/v1/organizations/${encodeURIComponent(slug)}/invitations`, {
      method: "GET",
    });
    return json.invitations || [];
  }

  /**
   * Invites a new user to join an organization.
   */
  async inviteMember(
    slug: string,
    params: InviteMemberParams,
  ): Promise<OrgInvitationItem> {
    const json = await this.client.request<{
      ok: boolean;
      invitation: OrgInvitationItem;
    }>(`/api/v1/organizations/${encodeURIComponent(slug)}/invitations`, {
      method: "POST",
      body: JSON.stringify(params),
    });
    return json.invitation;
  }

  /**
   * Revokes a pending organization invitation.
   */
  async revokeInvitation(slug: string, invitationId: string): Promise<void> {
    await this.client.request<{ ok: boolean }>(
      `/api/v1/organizations/${encodeURIComponent(slug)}/invitations/${encodeURIComponent(invitationId)}`,
      { method: "DELETE" },
    );
  }
}

/**
 * Organization-scoped MemCell handle providing memory operations and membership bound to an organization namespace.
 */
export class OrganizationMemCell {
  readonly memcell: MemCell;
  readonly orgSlug: string;

  constructor(memcell: MemCell, orgSlug: string) {
    this.memcell = memcell;
    this.orgSlug = orgSlug.toLowerCase().trim();
  }

  /**
   * Creates a scoped handle bound to a specific project within this organization.
   *
   * @example
   * ```ts
   * const acmeDevops = acmeMemory.scope("devops", { subject: "pipeline:deploy" });
   * const context = await acmeDevops.recall({ query: "deployment checklists" });
   * ```
   */
  scope(projectSlug: string, options?: ScopeOptions): ScopedMemCell {
    const cleanProject = projectSlug.startsWith(`${this.orgSlug}/`)
      ? projectSlug
      : `${this.orgSlug}/${projectSlug}`;
    return this.memcell.scope(cleanProject, options);
  }

  /**
   * Semantic alias for `scope(projectSlug, options)`.
   */
  forProject(projectSlug: string, options?: ScopeOptions): ScopedMemCell {
    return this.scope(projectSlug, options);
  }

  /**
   * Fetches organization details.
   */
  async get(): Promise<OrganizationItem> {
    return await this.memcell.organizations.get(this.orgSlug);
  }

  /**
   * Updates organization details.
   */
  async update(params: UpdateOrganizationParams): Promise<OrganizationItem> {
    return await this.memcell.organizations.update(this.orgSlug, params);
  }

  /**
   * Lists members of this organization.
   */
  async listMembers(
    params?: ListMembersParams,
  ): Promise<PaginatedResult<OrgMemberItem>> {
    return await this.memcell.organizations.listMembers(this.orgSlug, params);
  }

  /**
   * Updates a member's role in this organization.
   */
  async updateMemberRole(userId: string, role: OrgRole): Promise<void> {
    return await this.memcell.organizations.updateMemberRole(
      this.orgSlug,
      userId,
      role,
    );
  }

  /**
   * Removes a member from this organization.
   */
  async removeMember(userId: string): Promise<void> {
    return await this.memcell.organizations.removeMember(this.orgSlug, userId);
  }

  /**
   * Lists pending invitations for this organization.
   */
  async listInvitations(): Promise<OrgInvitationItem[]> {
    return await this.memcell.organizations.listInvitations(this.orgSlug);
  }

  /**
   * Invites a member to this organization.
   */
  async inviteMember(params: InviteMemberParams): Promise<OrgInvitationItem> {
    return await this.memcell.organizations.inviteMember(this.orgSlug, params);
  }

  /**
   * Recall statements scoped to this organization.
   */
  async recall(params: RecallParams): Promise<RecallResponse> {
    return this.memcell.recall({
      ...params,
      namespace: this.qualifyNamespace(params.namespace),
    });
  }

  /**
   * Remember statements scoped to this organization.
   */
  async remember(params: RememberParams): Promise<RememberResponse> {
    return this.memcell.remember({
      ...params,
      namespace: this.qualifyNamespace(params.namespace),
    });
  }

  /**
   * Report execution outcome scoped to this organization.
   */
  async report(params: ReportParams): Promise<ReportResponse> {
    return this.memcell.report({
      ...params,
      namespace: this.qualifyNamespace(params.namespace),
    });
  }

  /**
   * Submit feedback scoped to this organization.
   */
  async feedback(params: FeedbackParams): Promise<FeedbackResponse> {
    return this.memcell.feedback({
      ...params,
      namespace: this.qualifyNamespace(params.namespace),
    });
  }

  private qualifyNamespace(ns?: string): string {
    if (!ns) return this.orgSlug;
    if (ns === this.orgSlug || ns.startsWith(`${this.orgSlug}/`)) return ns;
    return `${this.orgSlug}/${ns}`;
  }
}
