import type { MemCell } from "./client.js";
import type {
  AuditEvent,
  CreateSiemDestinationParams,
  ListAuditEventsParams,
  SiemDestination,
} from "./types.js";

function buildAuditQuery(params?: ListAuditEventsParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.perPage !== undefined) q.set("perPage", String(params.perPage));
  if (params.actorId) q.set("actorId", params.actorId);
  if (params.actorType) q.set("actorType", params.actorType);
  if (params.action) q.set("action", params.action);
  if (params.targetType) q.set("targetType", params.targetType);
  if (params.targetId) q.set("targetId", params.targetId);
  if (params.projectId) q.set("projectId", params.projectId);
  if (params.teamId) q.set("teamId", params.teamId);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);

  const str = q.toString();
  return str ? `?${str}` : "";
}

export class OrganizationAuditNamespace {
  readonly destinations: SiemDestinationsNamespace;

  constructor(private readonly client: MemCell) {
    this.destinations = new SiemDestinationsNamespace(client);
  }

  /**
   * Queries immutable audit events for an enterprise organization.
   */
  async list(
    orgSlug: string,
    params?: ListAuditEventsParams,
  ): Promise<{
    events: AuditEvent[];
    total: number;
    page: number;
    perPage: number;
    hasMore: boolean;
  }> {
    const query = buildAuditQuery(params);
    return await this.client.request<{
      events: AuditEvent[];
      total: number;
      page: number;
      perPage: number;
      hasMore: boolean;
    }>(`/api/v1/organizations/${orgSlug}/audit-logs${query}`, {
      method: "GET",
    });
  }

  /**
   * Exports enterprise audit logs in CEF (ArcSight/Splunk), JSON, or CSV format.
   */
  async export(
    orgSlug: string,
    format: "cef" | "json" | "csv" = "json",
    params?: ListAuditEventsParams,
  ): Promise<string> {
    const query = buildAuditQuery(params);
    const joinChar = query ? "&" : "?";
    const res = await this.client.requestRaw(
      `/api/v1/organizations/${orgSlug}/audit-logs/export${query}${joinChar}format=${format}`,
      { method: "GET" },
    );
    return await res.text();
  }
}

export class SiemDestinationsNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists configured SIEM webhook forwarding destinations.
   */
  async list(orgSlug: string): Promise<SiemDestination[]> {
    const json = await this.client.request<{ destinations: SiemDestination[] }>(
      `/api/v1/organizations/${orgSlug}/audit-logs/destinations`,
      { method: "GET" },
    );
    return json.destinations;
  }

  /**
   * Creates a new real-time log forwarder destination (Splunk, Datadog, Webhook, etc.).
   */
  async create(
    orgSlug: string,
    params: CreateSiemDestinationParams,
  ): Promise<SiemDestination> {
    const json = await this.client.request<{
      ok: boolean;
      destination: SiemDestination;
    }>(`/api/v1/organizations/${orgSlug}/audit-logs/destinations`, {
      method: "POST",
      body: JSON.stringify(params),
    });
    return json.destination;
  }

  /**
   * Deletes a SIEM destination.
   */
  async delete(orgSlug: string, destinationId: string): Promise<void> {
    await this.client.request<{ ok: boolean }>(
      `/api/v1/organizations/${orgSlug}/audit-logs/destinations`,
      {
        method: "DELETE",
        body: JSON.stringify({ id: destinationId }),
      },
    );
  }
}

export class ScopedOrganizationAudit {
  readonly destinations: ScopedSiemDestinations;

  constructor(
    private readonly audit: OrganizationAuditNamespace,
    private readonly orgSlug: string,
  ) {
    this.destinations = new ScopedSiemDestinations(audit.destinations, orgSlug);
  }

  async list(params?: ListAuditEventsParams) {
    return this.audit.list(this.orgSlug, params);
  }

  async export(
    format: "cef" | "json" | "csv" = "json",
    params?: ListAuditEventsParams,
  ) {
    return this.audit.export(this.orgSlug, format, params);
  }
}

export class ScopedSiemDestinations {
  constructor(
    private readonly destinations: SiemDestinationsNamespace,
    private readonly orgSlug: string,
  ) {}

  async list() {
    return this.destinations.list(this.orgSlug);
  }

  async create(params: CreateSiemDestinationParams) {
    return this.destinations.create(this.orgSlug, params);
  }

  async delete(destinationId: string) {
    return this.destinations.delete(this.orgSlug, destinationId);
  }
}
