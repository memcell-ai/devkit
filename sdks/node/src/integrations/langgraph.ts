import type { ScopedMemCell } from "../scoped.js";
import type {
  MemoryItem,
  MemoryScope,
  MemoryType,
  OutcomeVerdict,
  ReportResponse,
} from "../types.js";
import { createMemCellTools, type MemCellToolsOptions } from "./vercel.js";

export interface LangGraphMessageLike {
  role?: string;
  type?: string;
  content?: unknown;
}

export interface LangGraphMemoryState {
  messages?: LangGraphMessageLike[];
  task?: string;
  query?: string;
  input?: string;
  memoryContext?: string;
  recallId?: string;
  recalledMemories?: MemoryItem[];
  outcome?: OutcomeVerdict;
  error?: string | null;
  memoryReported?: boolean;
  memoryReport?: ReportResponse;
  [key: string]: unknown;
}

export interface LangGraphMemoryOptions {
  /**
   * Action name recorded when reporting graph execution outcomes.
   * Defaults to `"langgraph_run"`.
   */
  action?: string;
  subject?: string | null;
  type?: MemoryType | MemoryType[];
  scope?: MemoryScope;
  minConfidence?: number;
  limit?: number;
  format?: "xml" | "markdown";
}

function extractStateQuery(state: LangGraphMemoryState): string {
  for (const key of ["query", "task", "input"] as const) {
    const val = state[key];
    if (typeof val === "string" && val.trim()) {
      return val.trim();
    }
  }

  if (Array.isArray(state.messages)) {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const msg = state.messages[i];
      if (!msg) continue;
      if (typeof msg.content === "string" && msg.content.trim()) {
        return msg.content.trim();
      }
      if (Array.isArray(msg.content)) {
        const texts: string[] = [];
        for (const item of msg.content) {
          if (
            item &&
            typeof item === "object" &&
            "text" in item &&
            typeof (item as { text?: unknown }).text === "string"
          ) {
            const t = ((item as { text: string }).text || "").trim();
            if (t) texts.push(t);
          }
        }
        if (texts.length > 0) return texts.join("\n");
      }
    }
  }

  return "";
}

/**
 * Creates drop-in `recallNode`, `reportNode`, and `wrapNode` functions for LangGraph.js `StateGraph` workflows.
 */
export function createLangGraphMemoryNodes(
  scoped: ScopedMemCell,
  options: LangGraphMemoryOptions = {},
) {
  const defaultAction = options.action ?? "langgraph_run";

  const recallNode = async (
    state: LangGraphMemoryState,
  ): Promise<Partial<LangGraphMemoryState>> => {
    const query = extractStateQuery(state) || defaultAction;
    const recalled = await scoped.recall(query, {
      subject: options.subject,
      type: options.type,
      scope: options.scope,
      minConfidence: options.minConfidence,
      limit: options.limit,
      format: options.format ?? "xml",
    });

    return {
      memoryContext: recalled.promptContext,
      recallId: recalled.recallId,
      recalledMemories: recalled.memories,
    };
  };

  const reportNode = async (
    state: LangGraphMemoryState,
  ): Promise<Partial<LangGraphMemoryState>> => {
    if (!state.recallId) {
      return { memoryReported: false };
    }

    const resolvedOutcome: OutcomeVerdict =
      state.outcome ?? (state.error ? "failed" : "worked");

    const report = await scoped.report({
      actionTaken: defaultAction,
      outcome: resolvedOutcome,
      recallId: state.recallId,
      subject: options.subject,
      reason: typeof state.error === "string" ? state.error : undefined,
    });

    return {
      memoryReported: true,
      memoryReport: report,
    };
  };

  const wrapNode = <TState extends LangGraphMemoryState>(
    actionName: string,
    nodeFn: (
      state: TState & {
        memoryContext: string;
        recallId: string;
        recalledMemories: MemoryItem[];
      },
    ) => Promise<Partial<TState>>,
  ) => {
    return async (state: TState): Promise<Partial<TState>> => {
      const query = extractStateQuery(state) || actionName;
      const wrapped = await scoped.wrapExecution(
        {
          action: actionName,
          query,
          subject: options.subject,
          type: options.type,
          scope: options.scope,
          minConfidence: options.minConfidence,
          limit: options.limit,
          format: options.format ?? "xml",
        },
        async (ctx) => {
          return await nodeFn({
            ...state,
            memoryContext: ctx.promptContext,
            recallId: ctx.recallId,
            recalledMemories: ctx.memories,
          });
        },
      );

      return {
        ...wrapped.result,
        memoryContext: wrapped.promptContext,
        recallId: wrapped.recallId,
        recalledMemories: wrapped.memories,
      };
    };
  };

  return {
    recallNode,
    reportNode,
    wrapNode,
  };
}

export interface LangChainCompatibleTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  invoke: (input: Record<string, unknown>) => Promise<string>;
  func: (input: Record<string, unknown>) => Promise<string>;
}

/**
 * Creates LangChain / LangGraph compatible tool descriptors (`name`, `description`, `schema`, `invoke`)
 * without requiring `@langchain/core` as a mandatory peer dependency.
 */
export function createLangChainTools(
  scoped: ScopedMemCell,
  options: MemCellToolsOptions = {},
): LangChainCompatibleTool[] {
  const base = createMemCellTools(scoped, options) as unknown as Record<
    string,
    {
      description: string;
      parameters: Record<string, unknown>;
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    }
  >;

  return Object.entries(base).map(([name, def]) => {
    const run = async (input: Record<string, unknown>): Promise<string> => {
      const res = await def.execute(input);
      return JSON.stringify(res);
    };
    return {
      name,
      description: def.description,
      schema: def.parameters,
      invoke: run,
      func: run,
    };
  });
}
