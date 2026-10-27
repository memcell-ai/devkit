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
import { createMemCellTools, type MemCellToolsOptions } from "./vercel.js";

export interface OpenAIChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIResponsesToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type OpenAIToolCallInput =
  | {
      id?: string;
      call_id?: string;
      name: string;
      arguments: string | Record<string, unknown>;
    }
  | {
      id?: string;
      function: {
        name: string;
        arguments: string | Record<string, unknown>;
      };
    };

export interface OpenAIToolExecutionResult {
  toolCallId?: string;
  name: string;
  output: string;
  data: unknown;
}

/**
 * Returns OpenAI Chat Completions (`tools: [...]`) function definitions backed by MemCell.
 */
export function createOpenAIMemoryTools(
  scoped: ScopedMemCell,
  options: MemCellToolsOptions = {},
): OpenAIChatToolDefinition[] {
  const base = createMemCellTools(scoped, options);
  return Object.entries(base).map(([name, def]) => ({
    type: "function" as const,
    function: {
      name,
      description: def.description,
      parameters: def.parameters,
    },
  }));
}

/**
 * Returns OpenAI Responses API / Agents SDK (`tools: [...]`) function definitions backed by MemCell.
 */
export function createOpenAIResponsesTools(
  scoped: ScopedMemCell,
  options: MemCellToolsOptions = {},
): OpenAIResponsesToolDefinition[] {
  const base = createMemCellTools(scoped, options);
  return Object.entries(base).map(([name, def]) => ({
    type: "function" as const,
    name,
    description: def.description,
    parameters: def.parameters,
  }));
}

/**
 * Executes an OpenAI tool call (`recall_memory`, `remember_memory`, `report_outcome`, `search_documents`)
 * from either Chat Completions or the Responses / Agents API and returns serialized JSON output.
 */
export async function executeOpenAIMemoryTool(
  scoped: ScopedMemCell,
  toolCall: OpenAIToolCallInput,
  options: MemCellToolsOptions = {},
): Promise<OpenAIToolExecutionResult> {
  const base = createMemCellTools(scoped, options) as unknown as Record<
    string,
    { execute: (args: Record<string, unknown>) => Promise<unknown> }
  >;

  const name = "function" in toolCall ? toolCall.function.name : toolCall.name;
  const rawArgs =
    "function" in toolCall ? toolCall.function.arguments : toolCall.arguments;
  const toolCallId =
    "call_id" in toolCall && toolCall.call_id ? toolCall.call_id : toolCall.id;

  const handler = base[name];
  if (!handler) {
    throw new Error(`Unknown MemCell OpenAI tool "${name}".`);
  }

  let parsedArgs: Record<string, unknown> = {};
  if (typeof rawArgs === "string") {
    parsedArgs = rawArgs.trim()
      ? (JSON.parse(rawArgs) as Record<string, unknown>)
      : {};
  } else if (rawArgs && typeof rawArgs === "object") {
    parsedArgs = rawArgs;
  }

  const data = await handler.execute(parsedArgs);
  return {
    toolCallId,
    name,
    output: JSON.stringify(data),
    data,
  };
}

/**
 * Recalls workspace memories for a task and builds a system instructions block ready for OpenAI Agents / Responses.
 */
export async function buildOpenAISystemInstructions(
  scoped: ScopedMemCell,
  query: string,
  baseInstructions = "",
  recallOptions?: Omit<RecallParams, "namespace" | "query">,
): Promise<{
  instructions: string;
  recallId: string;
  recall: RecallResponse;
}> {
  const recall = await scoped.recall(query, recallOptions);
  const parts = [baseInstructions.trim(), recall.promptContext.trim()].filter(
    Boolean,
  );
  return {
    instructions: parts.join("\n\n"),
    recallId: recall.recallId,
    recall,
  };
}

export interface OpenAIMemoryTurnContext extends ScopedExecutionContext {
  instructions: string;
  chatTools: OpenAIChatToolDefinition[];
  responsesTools: OpenAIResponsesToolDefinition[];
  executeToolCall: (
    toolCall: OpenAIToolCallInput,
  ) => Promise<OpenAIToolExecutionResult>;
}

/**
 * Runs an OpenAI agent or completion turn inside MemCell's closed-loop recall + outcome verification wrapper.
 */
export async function runWithOpenAIMemory<T>(
  scoped: ScopedMemCell,
  options: WrapExecutionOptions & {
    baseInstructions?: string;
    defaultScope?: MemoryScope;
    defaultType?: MemoryType;
    defaultOutcome?: OutcomeVerdict;
  },
  fn: (context: OpenAIMemoryTurnContext) => Promise<T>,
): Promise<ScopedExecutionResult<T>> {
  const toolOptions: MemCellToolsOptions = {
    defaultScope: options.defaultScope ?? options.scope,
    defaultSubject: options.subject,
  };
  const chatTools = createOpenAIMemoryTools(scoped, toolOptions);
  const responsesTools = createOpenAIResponsesTools(scoped, toolOptions);

  return await scoped.wrapExecution(options, async (ctx) => {
    const base = (options.baseInstructions ?? "").trim();
    const instructions = [base, ctx.promptContext.trim()]
      .filter(Boolean)
      .join("\n\n");

    return await fn({
      ...ctx,
      instructions,
      chatTools,
      responsesTools,
      executeToolCall: (call) =>
        executeOpenAIMemoryTool(scoped, call, toolOptions),
    });
  });
}
