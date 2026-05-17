// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChat } from "../src";
import type { Provider } from "../src";

function makeChunkedProvider(chunks: string[]): Provider {
  return {
    async *chatStream() {
      for (const chunk of chunks) {
        yield { kind: "content", text: chunk };
      }
      yield { kind: "finish", reason: "stop" };
    },
  };
}

describe("Streaming UI", () => {
  it("deltas append in-place to a single assistant message", async () => {
    const provider = makeChunkedProvider(["Hello", " ", "World"]);
    const { result } = renderHook(() => useChat({ provider }));

    await act(async () => {
      await result.current.send("Hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("Hello World");
  });

  it("status is idle and message is complete after stream ends", async () => {
    const provider = makeChunkedProvider(["a", "b", "c"]);
    const { result } = renderHook(() => useChat({ provider }));

    await act(async () => {
      await result.current.send("test");
    });

    expect(result.current.status).toBe("idle");
    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("abc");
  });

  it("status is streaming while content is in-flight, then idle when done", async () => {
    let resolveStream!: () => void;
    const provider: Provider = {
      async *chatStream() {
        yield { kind: "content", text: "hi" };
        await new Promise<void>((r) => { resolveStream = r; });
        yield { kind: "finish", reason: "stop" };
      },
    };

    const { result } = renderHook(() => useChat({ provider }));

    act(() => { result.current.send("test"); });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("streaming");

    await act(async () => {
      resolveStream();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("idle");
  });

  it("user message is appended before streaming begins", async () => {
    const provider = makeChunkedProvider(["reply"]);
    const { result } = renderHook(() => useChat({ provider }));

    await act(async () => {
      await result.current.send("My message");
    });

    const user = result.current.messages.find((m) => m.role === "user");
    expect(user?.content).toBe("My message");
  });

  it("multiple sequential sends accumulate messages", async () => {
    const provider = makeChunkedProvider(["ok"]);
    const { result } = renderHook(() => useChat({ provider }));

    await act(async () => {
      await result.current.send("first");
    });
    await act(async () => {
      await result.current.send("second");
    });

    const userMessages = result.current.messages.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(2);
  });

  it("second send is a no-op while streaming is active", async () => {
    let resolveStream!: () => void;
    const provider: Provider = {
      async *chatStream() {
        await new Promise<void>((r) => { resolveStream = r; });
        yield { kind: "content", text: "hi" };
        yield { kind: "finish", reason: "stop" };
      },
    };

    const { result } = renderHook(() => useChat({ provider }));
    const firstSend = act(() => { result.current.send("first"); });

    await act(async () => {
      await result.current.send("second");
    });

    resolveStream();
    await firstSend;

    const userMessages = result.current.messages.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content).toBe("first");
  });

  it("provider error propagates as error status with the error field set", async () => {
    const provider: Provider = {
      async *chatStream() {
        yield { kind: "content", text: "partial" };
        throw new Error("stream failed");
      },
    };

    const { result } = renderHook(() => useChat({ provider }));

    await act(async () => {
      await result.current.send("test");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toBe("stream failed");
  });

  it("send rejects any blank input — empty string, whitespace, tabs, and newlines", async () => {
    const provider = makeChunkedProvider(["reply"]);
    const { result } = renderHook(() => useChat({ provider }));

    for (const blank of ["", "   ", "\t", "\n", "\t\n  "]) {
      await act(async () => { await result.current.send(blank); });
      expect(result.current.messages.filter((m) => m.role === "user")).toHaveLength(0);
      expect(result.current.status).toBe("idle");
    }
  });
});
