import type { MemCell } from "./client.js";
import type { OrgTeam, OrgTeamDetail, TeamMemberItem } from "./types.js";

export class OrganizationTeamsNamespace {
  readonly members: TeamMembersNamespace;

  constructor(private readonly client: MemCell) {
    this.members = new TeamMembersNamespace(client);
  }

  /**
   * Lists teams within an organization.
   */
  async list(orgSlug: string): Promise<OrgTeam[]> {
    const json = await this.client.request<{ teams: OrgTeam[] }>(
      `/api/v1/organizations/${orgSlug}/teams`,
      { method: "GET" },
    );
    return json.teams;
  }

  /**
   * Creates a new team in the organization.
   */
  async create(orgSlug: string, name: string): Promise<OrgTeam> {
    const json = await this.client.request<{ ok: boolean; team: OrgTeam }>(
      `/api/v1/organizations/${orgSlug}/teams`,
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    );
    return json.team;
  }

  /**
   * Fetches details of a team, including assigned projects and agents.
   */
  async get(orgSlug: string, teamId: string): Promise<OrgTeamDetail> {
    return await this.client.request<OrgTeamDetail>(
      `/api/v1/organizations/${orgSlug}/teams/${teamId}`,
      { method: "GET" },
    );
  }

  /**
   * Updates team metadata.
   */
  async update(
    orgSlug: string,
    teamId: string,
    name: string,
  ): Promise<OrgTeam> {
    const json = await this.client.request<{ ok: boolean; team: OrgTeam }>(
      `/api/v1/organizations/${orgSlug}/teams/${teamId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name }),
      },
    );
    return json.team;
  }

  /**
   * Deletes a team from the organization.
   */
  async delete(orgSlug: string, teamId: string): Promise<void> {
    await this.client.request<{ ok: boolean }>(
      `/api/v1/organizations/${orgSlug}/teams/${teamId}`,
      { method: "DELETE" },
    );
  }
}

export class TeamMembersNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists members of a specific team with their team roles.
   */
  async list(orgSlug: string, teamId: string): Promise<TeamMemberItem[]> {
    const json = await this.client.request<{ members: TeamMemberItem[] }>(
      `/api/v1/organizations/${orgSlug}/teams/${teamId}/members`,
      { method: "GET" },
    );
    return json.members;
  }

  /**
   * Adds or updates a user's membership and role in a team.
   */
  async add(
    orgSlug: string,
    teamId: string,
    userId: string,
    role: "manager" | "member" = "member",
  ): Promise<void> {
    await this.client.request<{ ok: boolean }>(
      `/api/v1/organizations/${orgSlug}/teams/${teamId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ userId, role }),
      },
    );
  }

  /**
   * Removes a member from a team.
   */
  async remove(orgSlug: string, teamId: string, userId: string): Promise<void> {
    await this.client.request<{ ok: boolean }>(
      `/api/v1/organizations/${orgSlug}/teams/${teamId}/members`,
      {
        method: "DELETE",
        body: JSON.stringify({ userId }),
      },
    );
  }
}

export class ScopedOrganizationTeams {
  readonly members: ScopedTeamMembers;

  constructor(
    private readonly teams: OrganizationTeamsNamespace,
    private readonly orgSlug: string,
  ) {
    this.members = new ScopedTeamMembers(teams.members, orgSlug);
  }

  async list() {
    return this.teams.list(this.orgSlug);
  }

  async create(name: string) {
    return this.teams.create(this.orgSlug, name);
  }

  async get(teamId: string) {
    return this.teams.get(this.orgSlug, teamId);
  }

  async update(teamId: string, name: string) {
    return this.teams.update(this.orgSlug, teamId, name);
  }

  async delete(teamId: string) {
    return this.teams.delete(this.orgSlug, teamId);
  }
}

export class ScopedTeamMembers {
  constructor(
    private readonly members: TeamMembersNamespace,
    private readonly orgSlug: string,
  ) {}

  async list(teamId: string) {
    return this.members.list(this.orgSlug, teamId);
  }

  async add(
    teamId: string,
    userId: string,
    role: "manager" | "member" = "member",
  ) {
    return this.members.add(this.orgSlug, teamId, userId, role);
  }

  async remove(teamId: string, userId: string) {
    return this.members.remove(this.orgSlug, teamId, userId);
  }
}
