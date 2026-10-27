import type { ScopedMemCell } from "../scoped.js";
import type {
  MemoryScope,
  MemoryType,
  OutcomeVerdict,
  RecallParams,
  RecallResponse,
  ScopedExecutionContext,
  ScopedExecutionResult,
  WrapExecutionOptions,
} from "../types.js";

export interface VercelPromptPart {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

export interface VercelPromptMessage {
  role: string;
  content: string | VercelPromptPart[];
  [key: string]: unknown;
}

export interface VercelLanguageModelParams {
  prompt?: VercelPromptMessage[];
  [key: string]: unknown;
}

export interface VercelMiddlewareOptions {
  /**
   * Action label recorded on post-flight outcome reports.
   * Defaults to `"vercel_ai_generate"`.
   */
  action?: string;
  /**
   * Optional subject filter for recall & outcome reports.
   */
  subject?: string | null;
  /**
   * Optional memory type filter.
   */
  type?: MemoryType | MemoryType[];
  /**
   * Optional operational scope filter.
   */
  scope?: MemoryScope;
  /**
   * Minimum confidence threshold for recalled memories.
   */
  minConfidence?: number;
  /**
   * Maximum memories to inject into the system prompt.
   */
  limit?: number;
  /**
   * Prompt formatting mode (`"xml"` or `"markdown"`). Defaults to `"xml"`.
   */
  format?: "xml" | "markdown";
  /**
   * Whether to automatically report `"worked"` / `"failed"` outcomes after generation or stream completion.
   * Defaults to `true`.
   */
  autoReport?: boolean;
  /**
   * Vercel AI SDK middleware specification version (`"v1"`, `"v2"`, or `"v3"`).
   * Defaults to `"v2"`.
   */
  specificationVersion?: "v1" | "v2" | "v3";
}

export interface MemCellToolsOptions {
  defaultScope?: MemoryScope;
  defaultSubject?: string | null;
}

export interface MemCellToolDefinition<
  TInput = Record<string, unknown>,
  TOutput = unknown,
> {
  description: string;
  parameters: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  execute: (input: TInput) => Promise<TOutput>;
}

function extractPromptQuery(prompt?: VercelPromptMessage[]): string {
  if (!Array.isArray(prompt) || prompt.length === 0) return "";

  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i];
    if (!msg || msg.role !== "user") continue;

    if (typeof msg.content === "string") {
      const trimmed = msg.content.trim();
      if (trimmed) return trimmed;
    } else if (Array.isArray(msg.content)) {
      const parts: string[] = [];
      for (const part of msg.content) {
        if (part && typeof part.text === "string" && part.text.trim()) {
          parts.push(part.text.trim());
        }
      }
      if (parts.length > 0) {
        return parts.join("\n");
      }
    }
  }

  return "";
}

function injectSystemPromptContext(
  prompt: VercelPromptMessage[] | undefined,
  promptContext: string,
): VercelPromptMessage[] {
  if (!promptContext.trim()) {
    return prompt ? [...prompt] : [];
  }
  if (!Array.isArray(prompt) || prompt.length === 0) {
    return [{ role: "system", content: promptContext }];
  }

  const next = prompt.map((m) => ({ ...m }));
  const firstSystemIdx = next.findIndex((m) => m.role === "system");
  if (firstSystemIdx >= 0) {
    const existing = next[firstSystemIdx]!;
    if (typeof existing.content === "string") {
      next[firstSystemIdx] = {
        ...existing,
        content: existing.content
          ? `${existing.content}\n\n${promptContext}`
          : promptContext,
      };
      return next;
    }
  }

  return [{ role: "system", content: promptContext }, ...next];
}

/**
 * Creates a zero-dependency Vercel AI SDK LanguageModel Middleware (`wrapLanguageModel`)
 * that automatically recalls relevant workspace memories into the system prompt before generation
 * and reports `"worked"` or `"failed"` outcomes once generation or streaming finishes.
 */
export function createMemCellMiddleware(
  scoped: ScopedMemCell,
  options: VercelMiddlewareOptions = {},
) {
  const action = options.action ?? "vercel_ai_generate";
  const autoReport = options.autoReport ?? true;
  const recallCache = new WeakMap<object, RecallResponse>();

  const runRecall = async (
    params: VercelLanguageModelParams,
  ): Promise<RecallResponse | null> => {
    const cached = recallCache.get(params);
    if (cached) return cached;

    const query = extractPromptQuery(params.prompt) || action;
    const recallParams: Omit<RecallParams, "namespace" | "query"> = {
      subject: options.subject,
      type: options.type,
      scope: options.scope,
      minConfidence: options.minConfidence,
      limit: options.limit,
      format: options.format ?? "xml",
    };

    const recall = await scoped.recall(query, recallParams);
    recallCache.set(params, recall);
    return recall;
  };

  return {
    specificationVersion: options.specificationVersion ?? ("v2" as const),

    transformParams: async ({
      params,
    }: {
      params: VercelLanguageModelParams;
    }): Promise<VercelLanguageModelParams> => {
      const recall = await runRecall(params);
      if (!recall || !recall.promptContext) {
        return params;
      }

      const nextParams: VercelLanguageModelParams = {
        ...params,
        prompt: injectSystemPromptContext(params.prompt, recall.promptContext),
      };
      recallCache.set(nextParams, recall);
      return nextParams;
    },

    wrapGenerate: async <TResult>({
      doGenerate,
      params,
    }: {
      doGenerate: () => Promise<TResult>;
      params: VercelLanguageModelParams;
    }): Promise<TResult> => {
      const recall = await runRecall(params);
      try {
        const result = await doGenerate();
        if (autoReport && recall?.recallId) {
          await scoped
            .report({
              actionTaken: action,
              outcome: "worked",
              recallId: recall.recallId,
              subject: options.subject,
            })
            .catch(() => null);
        }
        return result;
      } catch (err) {
        if (autoReport && recall?.recallId) {
          const reason = err instanceof Error ? err.message : String(err);
          await scoped
            .report({
              actionTaken: action,
              outcome: "failed",
              recallId: recall.recallId,
              subject: options.subject,
              reason,
            })
            .catch(() => null);
        }
        throw err;
      }
    },

    wrapStream: async <
      TStreamResult extends { stream: ReadableStream<unknown> },
    >({
      doStream,
      params,
    }: {
      doStream: () => Promise<TStreamResult>;
      params: VercelLanguageModelParams;
    }): Promise<TStreamResult> => {
      const recall = await runRecall(params);
      let streamResult: TStreamResult;
      try {
        streamResult = await doStream();
      } catch (err) {
        if (autoReport && recall?.recallId) {
          const reason = err instanceof Error ? err.message : String(err);
          await scoped
            .report({
              actionTaken: action,
              outcome: "failed",
              recallId: recall.recallId,
              subject: options.subject,
              reason,
            })
            .catch(() => null);
        }
        throw err;
      }

      if (!autoReport || !recall?.recallId || !streamResult?.stream) {
        return streamResult;
      }

      let settled = false;
      const reportOnce = async (outcome: OutcomeVerdict, reason?: string) => {
        if (settled) return;
        settled = true;
        await scoped
          .report({
            actionTaken: action,
            outcome,
            recallId: recall.recallId,
            subject: options.subject,
            reason,
          })
          .catch(() => null);
      };

      const transform = new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);
        },
        async flush() {
          await reportOnce("worked");
        },
      });

      const piped = streamResult.stream.pipeThrough(transform);
      return {
        ...streamResult,
        stream: piped,
      };
    },
  };
}

/**
 * Ready-to-use JSON-Schema tool definitions for Vercel AI SDK (`generateText` / `streamText`)
 * exposing `recall_memory`, `remember_memory`, `report_outcome`, and `search_documents`.
 */
export function createMemCellTools(
  scoped: ScopedMemCell,
  options: MemCellToolsOptions = {},
): {
  recall_memory: MemCellToolDefinition<{
    query: string;
    type?: MemoryType;
    limit?: number;
  }>;
  remember_memory: MemCellToolDefinition<{
    title: string;
    content?: string;
    type?: MemoryType;
    enforce?: boolean;
  }>;
  report_outcome: MemCellToolDefinition<{
    outcome: OutcomeVerdict;
    recallId?: string;
    memoryId?: string;
    actionTaken?: string;
    reason?: string;
  }>;
  search_documents: MemCellToolDefinition<{
    query: string;
    limit?: number;
  }>;
} {
  const recallSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural-language task intent or question to recall workspace memories for.",
      },
      type: {
        type: "string",
        enum: ["instruction", "decision", "fact", "preference"],
        description: "Optional memory type filter.",
      },
      limit: {
        type: "number",
        description: "Maximum memories to return (default 5).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  };

  const rememberSchema = {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "Concise one-sentence instruction, decision, fact, or preference to persist.",
      },
      content: {
        type: "string",
        description:
          "Optional detailed operational specification or rationale.",
      },
      type: {
        type: "string",
        enum: ["instruction", "decision", "fact", "preference"],
        description: "Memory category (defaults to fact).",
      },
      enforce: {
        type: "boolean",
        description:
          "Set true when saving a standing instruction that future runs must follow.",
      },
    },
    required: ["title"],
    additionalProperties: false,
  };

  const reportSchema = {
    type: "object",
    properties: {
      outcome: {
        type: "string",
        enum: ["worked", "failed", "avoided"],
        description:
          "Whether the recalled memory worked, failed, or was avoided.",
      },
      recallId: {
        type: "string",
        description: "The recallId returned from a prior recall call.",
      },
      memoryId: {
        type: "string",
        description: "Specific memory ID to attribute the outcome to.",
      },
      actionTaken: {
        type: "string",
        description: "Summary of the action executed.",
      },
      reason: {
        type: "string",
        description: "Explanation of why the approach worked or failed.",
      },
    },
    required: ["outcome"],
    additionalProperties: false,
  };

  const searchDocsSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural-language search query across workspace documents.",
      },
      limit: {
        type: "number",
        description: "Maximum grounded chunks to return (default 5).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  };

  return {
    recall_memory: {
      description:
        "Recall verified workspace memories, instructions, active threads, and grounded document chunks before acting.",
      parameters: recallSchema,
      inputSchema: recallSchema,
      execute: async (input) => {
        const res = await scoped.recall(input.query, {
          type: input.type,
          limit: input.limit,
          subject: options.defaultSubject,
          scope: options.defaultScope,
        });
        return {
          recallId: res.recallId,
          promptContext: res.promptContext,
          memories: res.memories,
          documentChunks: res.documentChunks ?? [],
        };
      },
    },
    remember_memory: {
      description:
        "Save a verified instruction, decision, fact, or preference to shared workspace memory.",
      parameters: rememberSchema,
      inputSchema: rememberSchema,
      execute: async (input) => {
        const res = await scoped.remember({
          title: input.title,
          content: input.content,
          type: input.type ?? "fact",
          enforce: input.enforce ?? false,
          scope: options.defaultScope ?? "workspace",
          subject: options.defaultSubject,
        });
        return {
          created: res.created,
          evolved: res.evolved ?? [],
          note: res.note,
        };
      },
    },
    report_outcome: {
      description:
        "Report whether recalled workspace memory worked, failed, or was avoided so confidence calibrates from real outcomes.",
      parameters: reportSchema,
      inputSchema: reportSchema,
      execute: async (input) => {
        return await scoped.report({
          actionTaken: input.actionTaken ?? "tool_report",
          outcome: input.outcome,
          recallId: input.recallId,
          memoryId: input.memoryId,
          reason: input.reason,
          subject: options.defaultSubject,
        });
      },
    },
    search_documents: {
      description:
        "Search grounded PDF, DOCX, CSV, HTML, and Markdown document chunks indexed in this workspace.",
      parameters: searchDocsSchema,
      inputSchema: searchDocsSchema,
      execute: async (input) => {
        return await scoped.documents.search({
          query: input.query,
          limit: input.limit ?? 5,
        });
      },
    },
  };
}

/**
 * Convenience wrapper for running a Vercel AI SDK turn inside MemCell's pre-flight recall & post-flight outcome loop.
 */
export async function withMemCellVercelTurn<T>(
  scoped: ScopedMemCell,
  options: WrapExecutionOptions,
  fn: (context: ScopedExecutionContext) => Promise<T>,
): Promise<ScopedExecutionResult<T>> {
  return await scoped.wrapExecution(options, fn);
}
