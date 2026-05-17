// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { z } from "zod";

// ─── Finish reason ──────────────────────────────────────────────────────────

export type FinishReason = "stop" | "tool_calls" | "length" | "content_filter";

// ─── Streaming delta variants ────────────────────────────────────────────────

export type ChatDelta =
  | { readonly kind: "content"; readonly text: string }
  | { readonly kind: "tool_call_start"; readonly index: number; readonly id: string; readonly name: string }
  | { readonly kind: "tool_call_args"; readonly index: number; readonly argumentsChunk: string }
  | { readonly kind: "finish"; readonly reason: FinishReason };

// ─── Tool call and result ────────────────────────────────────────────────────

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: unknown;
}

export interface ToolResult {
  readonly toolCallId: string;
  readonly content: string;
}

// ─── Chat messages ───────────────────────────────────────────────────────────

export type ChatMessage =
  | { readonly role: "system"; readonly content: string }
  | { readonly role: "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content: string; readonly toolCalls?: readonly ToolCall[] }
  | { readonly role: "tool"; readonly toolCallId: string; readonly content: string };

// ─── Tool interface ──────────────────────────────────────────────────────────

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodSchema;
  readonly execute: (args: unknown, signal?: AbortSignal) => Promise<unknown>;
}

// ─── Provider interface ──────────────────────────────────────────────────────

export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly Tool[];
  readonly signal?: AbortSignal;
}

export interface Provider {
  chatStream(request: ChatRequest): AsyncIterable<ChatDelta>;
}

// ─── Zod schemas (public API per spec §4) ───────────────────────────────────

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.unknown(),
});

export const ChatMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("system"), content: z.string() }),
  z.object({ role: z.literal("user"), content: z.string() }),
  z.object({
    role: z.literal("assistant"),
    content: z.string(),
    toolCalls: z.array(ToolCallSchema).optional(),
  }),
  z.object({ role: z.literal("tool"), toolCallId: z.string(), content: z.string() }),
]);

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.custom<z.ZodSchema>(),
  execute: z.function().args(z.unknown()).returns(z.promise(z.unknown())),
});
