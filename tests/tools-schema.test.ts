// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { buildToolsMap, executeToolCalls, ToolArgumentsError, ToolNotFoundError } from "../src/core/tools";
import { ChatMessageSchema, ToolSchema } from "../src";
import type { ToolCall } from "../src";

function makeCall(name: string, args: unknown): ToolCall {
  return { id: "call_1", name, arguments: args };
}

describe("Tool schema validation", () => {
  it("rejects args failing Zod schema — throws ToolArgumentsError", async () => {
    const tool = {
      name: "strict",
      description: "strict",
      schema: z.object({ count: z.number().int().positive() }),
      execute: async () => "ok",
    };

    const map = buildToolsMap([tool]);
    await expect(
      executeToolCalls([makeCall("strict", { count: -5 })], map),
    ).rejects.toThrow(ToolArgumentsError);
  });

  it("rejects string where number expected", async () => {
    const tool = {
      name: "t",
      description: "t",
      schema: z.object({ n: z.number() }),
      execute: async () => "ok",
    };

    const map = buildToolsMap([tool]);
    await expect(
      executeToolCalls([makeCall("t", { n: "not-a-number" })], map),
    ).rejects.toThrow(ToolArgumentsError);
  });

  it("rejects missing required field", async () => {
    const tool = {
      name: "t",
      description: "t",
      schema: z.object({ required: z.string() }),
      execute: async () => "ok",
    };

    const map = buildToolsMap([tool]);
    await expect(
      executeToolCalls([makeCall("t", {})], map),
    ).rejects.toThrow(ToolArgumentsError);
  });

  it("accepts valid args and returns result", async () => {
    const tool = {
      name: "greet",
      description: "greet",
      schema: z.object({ name: z.string() }),
      execute: async (args: unknown) => `Hello ${(args as { name: string }).name}`,
    };

    const map = buildToolsMap([tool]);
    const results = await executeToolCalls([makeCall("greet", { name: "Alice" })], map);

    expect(results[0].content).toBe("Hello Alice");
    expect(results[0].role).toBe("tool");
    expect((results[0] as { toolCallId: string }).toolCallId).toBe("call_1");
  });

  it("serializes non-string results to JSON", async () => {
    const tool = {
      name: "obj",
      description: "obj",
      schema: z.object({}),
      execute: async () => ({ x: 1, y: 2 }),
    };

    const map = buildToolsMap([tool]);
    const results = await executeToolCalls([makeCall("obj", {})], map);
    expect(JSON.parse(results[0].content)).toEqual({ x: 1, y: 2 });
  });

  it("throws ToolNotFoundError for an unregistered tool name", async () => {
    const map = buildToolsMap([]);
    await expect(
      executeToolCalls([makeCall("unknown", {})], map),
    ).rejects.toThrow(ToolNotFoundError);
  });

  it("ToolArgumentsError carries a cause pointing to the ZodError", async () => {
    const tool = {
      name: "t",
      description: "t",
      schema: z.object({ x: z.number() }),
      execute: async () => "ok",
    };

    const map = buildToolsMap([tool]);
    let caught: ToolArgumentsError | undefined;
    try {
      await executeToolCalls([makeCall("t", { x: "bad" })], map);
    } catch (e) {
      caught = e as ToolArgumentsError;
    }

    expect(caught).toBeInstanceOf(ToolArgumentsError);
    expect((caught?.cause as z.ZodError)?.errors).toBeDefined();
  });

  it("ToolSchema validates a well-formed Tool object", () => {
    const valid = {
      name: "t",
      description: "d",
      schema: z.object({ x: z.string() }),
      execute: async () => "ok",
    };
    expect(() => ToolSchema.parse(valid)).not.toThrow();
  });

  it("ChatMessageSchema round-trips all four roles", () => {
    const samples: unknown[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "user" },
      { role: "assistant", content: "asst" },
      { role: "tool", toolCallId: "tc1", content: "result" },
    ];
    for (const sample of samples) {
      expect(() => ChatMessageSchema.parse(sample)).not.toThrow();
    }
  });

  it("ChatMessageSchema rejects a message with an unknown role", () => {
    expect(() =>
      ChatMessageSchema.parse({ role: "superuser", content: "hi" }),
    ).toThrow();
  });

  it("executeToolCalls forwards AbortSignal to the tool execute function", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;

    const tool = {
      name: "spy",
      description: "spy",
      schema: z.object({}),
      execute: async (_args: unknown, signal?: AbortSignal) => {
        receivedSignal = signal;
        return "done";
      },
    };

    const map = buildToolsMap([tool]);
    await executeToolCalls(
      [{ id: "c1", name: "spy", arguments: {} }],
      map,
      controller.signal,
    );

    expect(receivedSignal).toBe(controller.signal);
  });
});
