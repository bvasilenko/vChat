// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { z } from "zod";
import { useChat } from "../src";
import type { Provider, Tool } from "../src";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function makeTwoRoundProvider(): Provider {
  let round = 0;
  return {
    async *chatStream() {
      round++;
      if (round === 1) {
        yield { kind: "tool_call_start", index: 0, id: "call_1", name: "get_weather" };
        yield { kind: "tool_call_args", index: 0, argumentsChunk: '{"location":"NYC"}' };
        yield { kind: "finish", reason: "tool_calls" };
      } else {
        yield { kind: "content", text: "It is 72°F in NYC" };
        yield { kind: "finish", reason: "stop" };
      }
    },
  };
}

describe("Tool dispatch", () => {
  it("assistant tool_calls trigger execute, result is fed back as tool message", async () => {
    const executeMock = vi.fn().mockResolvedValue({ temp: 72 });

    const weatherTool: Tool = {
      name: "get_weather",
      description: "Get temperature",
      schema: z.object({ location: z.string() }),
      execute: executeMock,
    };

    const { result } = renderHook(() =>
      useChat({ provider: makeTwoRoundProvider(), tools: [weatherTool] }),
    );

    await act(async () => {
      await result.current.send("What is the weather in NYC?");
    });

    expect(executeMock).toHaveBeenCalledOnce();
    expect(executeMock).toHaveBeenCalledWith({ location: "NYC" }, expect.anything());

    const toolMsg = result.current.messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content).toContain("72");

    const lastAssistant = [...result.current.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    expect(lastAssistant?.content).toBe("It is 72°F in NYC");
  });

  it("multiple tool calls in one response run in parallel", async () => {
    const order: string[] = [];

    const slowTool: Tool = {
      name: "slow",
      description: "slow",
      schema: z.object({}),
      execute: async () => {
        await new Promise((r) => setTimeout(r, 50));
        order.push("slow");
        return "slow done";
      },
    };
    const fastTool: Tool = {
      name: "fast",
      description: "fast",
      schema: z.object({}),
      execute: async () => {
        order.push("fast");
        return "fast done";
      },
    };

    let round = 0;
    const provider: Provider = {
      async *chatStream() {
        round++;
        if (round === 1) {
          yield { kind: "tool_call_start", index: 0, id: "call_1", name: "slow" };
          yield { kind: "tool_call_args", index: 0, argumentsChunk: "{}" };
          yield { kind: "tool_call_start", index: 1, id: "call_2", name: "fast" };
          yield { kind: "tool_call_args", index: 1, argumentsChunk: "{}" };
          yield { kind: "finish", reason: "tool_calls" };
        } else {
          yield { kind: "content", text: "Done" };
          yield { kind: "finish", reason: "stop" };
        }
      },
    };

    const { result } = renderHook(() =>
      useChat({ provider, tools: [slowTool, fastTool] }),
    );

    await act(async () => {
      await result.current.send("Do both");
    });

    expect(order[0]).toBe("fast");
    expect(order[1]).toBe("slow");
  });

  it("tool result is appended as a role:tool message before the next assistant message", async () => {
    const tool: Tool = {
      name: "echo",
      description: "echo",
      schema: z.object({ msg: z.string() }),
      execute: async (args: unknown) => (args as { msg: string }).msg,
    };

    let round = 0;
    const provider: Provider = {
      async *chatStream() {
        round++;
        if (round === 1) {
          yield { kind: "tool_call_start", index: 0, id: "c1", name: "echo" };
          yield { kind: "tool_call_args", index: 0, argumentsChunk: '{"msg":"hello"}' };
          yield { kind: "finish", reason: "tool_calls" };
        } else {
          yield { kind: "content", text: "echoed" };
          yield { kind: "finish", reason: "stop" };
        }
      },
    };

    const { result } = renderHook(() => useChat({ provider, tools: [tool] }));

    await act(async () => {
      await result.current.send("echo hello");
    });

    const roles = result.current.messages.map((m) => m.role);
    const toolIdx = roles.indexOf("tool");
    expect(toolIdx).toBeGreaterThan(-1);
    expect(roles[toolIdx + 1]).toBe("assistant");
  });

  it("error in tool execute propagates as error status", async () => {
    const brokenTool: Tool = {
      name: "broken",
      description: "broken",
      schema: z.object({}),
      execute: async () => {
        throw new Error("tool exploded");
      },
    };

    const provider: Provider = {
      async *chatStream() {
        yield { kind: "tool_call_start", index: 0, id: "c1", name: "broken" };
        yield { kind: "tool_call_args", index: 0, argumentsChunk: "{}" };
        yield { kind: "finish", reason: "tool_calls" };
      },
    };

    const { result } = renderHook(() => useChat({ provider, tools: [brokenTool] }));

    await act(async () => {
      await result.current.send("break");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toContain("tool exploded");
  });
});
