export interface ResolvedProject {
  owner?: string;
  project: string;
  workspace?: string;
  namespace: string;
  projectId?: string;
  workspaceId?: string;
  at?: string;
  source: "flag" | "file" | "config" | "active";
}

export type ResolvedWorkspace = ResolvedProject;

export interface ResolvedContext {
  instance: string;
  from: string;
  credential: { token: string; obtainedAt?: string } | null;
  project: ResolvedProject | null;
  workspace?: ResolvedProject | null;
  owner: string | null;
}

export interface CommandRequirements {
  auth?: "required" | "optional" | "none";
  project?: "required" | "optional" | "none";
  workspace?: "required" | "optional" | "none";
}

export interface Invocation {
  instance: string;
  from: string;
  args: Record<string, string>;
  flags: Record<string, string | true>;
  many: Record<string, string[]>;
  context?: ResolvedContext;
}

export interface Command {
  path: string[];
  what: string;
  hidden?: boolean;
  require?: CommandRequirements;
  run(invocation: Invocation): Promise<number>;
}
