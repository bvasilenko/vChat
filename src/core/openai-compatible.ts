// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { zodToJsonSchema } from "zod-to-json-schema";
import { parseSSEStream } from "./stream";
import type { Provider, ChatRequest, ChatDelta, ChatMessage, Tool } from "./types";

// ─── Wire format helpers ──────────────────────────────────────────────────────

function toApiMessage(msg: ChatMessage): Record<string, unknown> {
  if (msg.role === "tool") {
    return { role: "tool", tool_call_id: msg.toolCallId, content: msg.content };
  }
  if (msg.role === "assistant" && msg.toolCalls?.length) {
    return {
      role: "assistant",
      content: msg.content || null,
      tool_calls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
  return { role: msg.role, content: msg.content };
}

function toApiTool(tool: Tool): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema, { $refStrategy: "none" }),
    },
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface OpenAICompatibleProviderOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export class OpenAICompatibleProvider implements Provider {
  constructor(private readonly opts: OpenAICompatibleProviderOptions) {}

  async *chatStream(request: ChatRequest): AsyncIterable<ChatDelta> {
    const body: Record<string, unknown> = {
      model: this.opts.model,
      messages: request.messages.map(toApiMessage),
      stream: true,
    };

    if (request.tools?.length) {
      body.tools = request.tools.map(toApiTool);
      body.tool_choice = "auto";
    }

    const response = await fetch(`${this.opts.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Provider error ${response.status}: ${text}`);
    }

    if (!response.body) {
      throw new Error("Provider returned empty response body");
    }

    yield* parseSSEStream(response.body, request.signal);
  }
}
