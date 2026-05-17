// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect } from "vitest";
import type { Provider, ChatDelta, ChatRequest } from "../src";

function makeMockProvider(deltas: ChatDelta[]): Provider {
  return {
    async *chatStream(_req: ChatRequest) {
      for (const delta of deltas) yield delta;
    },
  };
}

describe("Provider contract", () => {
  it("chatStream yields content deltas and finishes", async () => {
    const deltas: ChatDelta[] = [
      { kind: "content", text: "Hello" },
      { kind: "content", text: " World" },
      { kind: "finish", reason: "stop" },
    ];
    const provider = makeMockProvider(deltas);
    const collected: ChatDelta[] = [];

    for await (const delta of provider.chatStream({ messages: [] })) {
      collected.push(delta);
    }

    expect(collected).toEqual(deltas);
  });

  it("chatStream yields tool call deltas", async () => {
    const deltas: ChatDelta[] = [
      { kind: "tool_call_start", index: 0, id: "call_1", name: "get_weather" },
      { kind: "tool_call_args", index: 0, argumentsChunk: '{"location":' },
      { kind: "tool_call_args", index: 0, argumentsChunk: '"NYC"}' },
      { kind: "finish", reason: "tool_calls" },
    ];
    const provider = makeMockProvider(deltas);
    const collected: ChatDelta[] = [];

    for await (const delta of provider.chatStream({ messages: [] })) {
      collected.push(delta);
    }

    expect(collected).toHaveLength(4);
    expect(collected[0]).toMatchObject({ kind: "tool_call_start", name: "get_weather" });
    expect(collected[3]).toMatchObject({ kind: "finish", reason: "tool_calls" });
  });

  it("chatStream respects AbortSignal passed in request", async () => {
    const controller = new AbortController();
    const provider: Provider = {
      async *chatStream({ signal }) {
        for (let i = 0; i < 100; i++) {
          if (signal?.aborted) return;
          yield { kind: "content", text: `chunk${i}` };
        }
      },
    };

    controller.abort();
    const collected: ChatDelta[] = [];
    for await (const delta of provider.chatStream({ messages: [], signal: controller.signal })) {
      collected.push(delta);
    }
    expect(collected).toHaveLength(0);
  });

  it("chatStream forwards tools to the request", async () => {
    let capturedRequest: ChatRequest | undefined;
    const provider: Provider = {
      async *chatStream(req) {
        capturedRequest = req;
        yield { kind: "finish", reason: "stop" };
      },
    };

    const tool = { name: "t", description: "d", schema: {} as never, execute: async () => {} };
    for await (const _delta of provider.chatStream({ messages: [], tools: [tool] })) {
      // drain
    }

    expect(capturedRequest?.tools).toHaveLength(1);
    expect(capturedRequest?.tools?.[0].name).toBe("t");
  });

  it("chatStream handles empty delta sequence without error", async () => {
    const provider = makeMockProvider([]);
    const collected: ChatDelta[] = [];
    for await (const delta of provider.chatStream({ messages: [] })) {
      collected.push(delta);
    }
    expect(collected).toHaveLength(0);
  });
});
