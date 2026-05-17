// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChat } from "../src";
import type { Provider } from "../src";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("Abort", () => {
  it("abort cancels an in-flight stream and resets status to idle", async () => {
    let streamAborted = false;

    const provider: Provider = {
      async *chatStream({ signal }) {
        await new Promise<void>((resolve) => {
          signal?.addEventListener("abort", () => {
            streamAborted = true;
            resolve();
          });
        });
        yield { kind: "finish" as const, reason: "stop" as const };
      },
    };

    const { result } = renderHook(() => useChat({ provider }));

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.send("hello");
    });

    await act(async () => {
      result.current.abort();
      await sendPromise!;
    });

    expect(result.current.status).toBe("idle");
    expect(streamAborted).toBe(true);
  });

  it("abort is a no-op when no stream is active", async () => {
    const provider: Provider = {
      async *chatStream() {
        yield { kind: "finish", reason: "stop" };
      },
    };

    const { result } = renderHook(() => useChat({ provider }));

    await act(async () => {
      result.current.abort();
      result.current.abort();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("messages already received before abort are preserved", async () => {
    const provider: Provider = {
      async *chatStream({ signal }) {
        yield { kind: "content", text: "partial" };
        await new Promise<void>((resolve) => {
          const check = () => {
            if (signal?.aborted) resolve();
            else setTimeout(check, 5);
          };
          check();
        });
        if (!signal?.aborted) yield { kind: "finish", reason: "stop" };
      },
    };

    const { result } = renderHook(() => useChat({ provider }));

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.send("test");
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
      result.current.abort();
      await sendPromise!;
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toContain("partial");
  });
});
