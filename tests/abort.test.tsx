// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChat } from "../src";
import type { Provider } from "../src";

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
          if (signal?.aborted) return resolve();
          signal?.addEventListener("abort", () => resolve());
        });
      },
    };

    const { result } = renderHook(() => useChat({ provider }));

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.send("test");
    });

    // Flush the microtask queue so the generator reaches its abort-await before abort() fires.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      result.current.abort();
      await sendPromise!;
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toContain("partial");
  });

  it("status returns to idle after abort, allowing a subsequent send", async () => {
    let streamCount = 0;
    const provider: Provider = {
      async *chatStream({ signal }) {
        streamCount++;
        if (streamCount === 1) {
          await new Promise<void>((resolve) => {
            signal?.addEventListener("abort", () => resolve());
          });
        } else {
          yield { kind: "content", text: "ok" };
        }
        yield { kind: "finish", reason: "stop" };
      },
    };

    const { result } = renderHook(() => useChat({ provider }));

    let firstSend: Promise<void>;
    act(() => { firstSend = result.current.send("first"); });
    await act(async () => {
      result.current.abort();
      await firstSend!;
    });

    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.send("second");
    });

    expect(result.current.status).toBe("idle");
    const userMessages = result.current.messages.filter((m) => m.role === "user");
    expect(userMessages.some((m) => m.content === "second")).toBe(true);
  });
});
