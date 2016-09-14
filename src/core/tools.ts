import type { ZodError } from "zod";
import type { Tool, ToolCall, ChatMessage } from "./types";

// ─── Typed errors ─────────────────────────────────────────────────────────────

export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Tool not found: ${name}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolArgumentsError extends Error {
  constructor(name: string, cause: ZodError) {
    super(`Invalid arguments for tool "${name}": ${cause.message}`);
    this.name = "ToolArgumentsError";
    this.cause = cause;
  }
}

export class ToolRoundLimitError extends Error {
  constructor(limit: number) {
    super(`Tool dispatch exceeded ${limit} rounds`);
    this.name = "ToolRoundLimitError";
  }
}

// ─── Tool map builder ─────────────────────────────────────────────────────────

export function buildToolsMap(tools: readonly Tool[]): ReadonlyMap<string, Tool> {
  return new Map(tools.map((t) => [t.name, t]));
}

// ─── Single tool call ─────────────────────────────────────────────────────────

async function executeSingleToolCall(
  toolCall: ToolCall,
  toolsByName: ReadonlyMap<string, Tool>,
  signal?: AbortSignal,
): Promise<ChatMessage> {
  const tool = toolsByName.get(toolCall.name);
  if (!tool) throw new ToolNotFoundError(toolCall.name);

  const parseResult = tool.schema.safeParse(toolCall.arguments);
  if (!parseResult.success) {
    throw new ToolArgumentsError(toolCall.name, parseResult.error);
  }

  const raw = await tool.execute(parseResult.data, signal);
  const content = typeof raw === "string" ? raw : JSON.stringify(raw);

  return { role: "tool", toolCallId: toolCall.id, content };
}

// ─── Batch execution (parallel) ───────────────────────────────────────────────
// All tool calls within a single assistant message run concurrently.
// Caller is responsible for checking signal.aborted before using results.

export async function executeToolCalls(
  toolCalls: readonly ToolCall[],
  toolsByName: ReadonlyMap<string, Tool>,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  return Promise.all(toolCalls.map((tc) => executeSingleToolCall(tc, toolsByName, signal)));
}
