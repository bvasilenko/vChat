// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChat } from "../src";
import { makeInstantProvider } from "./helpers";

describe("History persistence", () => {
  it("useChat({ persist: true }) writes messages to localStorage after send", async () => {
    const provider = makeInstantProvider();
    const { result } = renderHook(() =>
      useChat({ provider, persist: true, persistId: "test-write" }),
    );

    await act(async () => {
      await result.current.send("Hello");
    });

    const raw = localStorage.getItem("v:vchat:test-write");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((m: { role: string }) => m.role === "user")).toBe(true);
  });

  it("restores messages on remount with the same persistId", async () => {
    const provider = makeInstantProvider();
    const { result: r1, unmount } = renderHook(() =>
      useChat({ provider, persist: true, persistId: "test-restore" }),
    );

    await act(async () => {
      await r1.current.send("First message");
    });
    unmount();

    const { result: r2 } = renderHook(() =>
      useChat({ provider, persist: true, persistId: "test-restore" }),
    );

    expect(r2.current.messages.some((m) => m.content === "First message")).toBe(true);
  });

  it("does not write to localStorage when persist is false", async () => {
    const provider = makeInstantProvider();
    const { result } = renderHook(() =>
      useChat({ provider, persist: false, persistId: "test-nopersist" }),
    );

    await act(async () => {
      await result.current.send("Hello");
    });

    expect(localStorage.getItem("v:vchat:test-nopersist")).toBeNull();
  });

  it("different persistIds are stored independently", async () => {
    const provider = makeInstantProvider();

    const { result: r1 } = renderHook(() =>
      useChat({ provider, persist: true, persistId: "chat-A" }),
    );
    const { result: r2 } = renderHook(() =>
      useChat({ provider, persist: true, persistId: "chat-B" }),
    );

    await act(async () => {
      await r1.current.send("A message");
    });
    await act(async () => {
      await r2.current.send("B message");
    });

    const rawA = JSON.parse(localStorage.getItem("v:vchat:chat-A")!);
    const rawB = JSON.parse(localStorage.getItem("v:vchat:chat-B")!);

    expect(rawA.some((m: { content: string }) => m.content === "A message")).toBe(true);
    expect(rawB.some((m: { content: string }) => m.content === "B message")).toBe(true);
    expect(rawA.some((m: { content: string }) => m.content === "B message")).toBe(false);
  });

  it("persisted assistant messages are restored correctly", async () => {
    const provider = makeInstantProvider();
    const { result: r1, unmount } = renderHook(() =>
      useChat({ provider, persist: true, persistId: "test-asst" }),
    );

    await act(async () => {
      await r1.current.send("ping");
    });
    unmount();

    const { result: r2 } = renderHook(() =>
      useChat({ provider, persist: true, persistId: "test-asst" }),
    );

    expect(r2.current.messages.some((m) => m.role === "assistant")).toBe(true);
  });

  it("system message appears exactly once after restoring persisted state", async () => {
    const provider = makeInstantProvider();
    const system = "You are a helpful assistant.";

    const { result: r1, unmount } = renderHook(() =>
      useChat({ provider, persist: true, persistId: "test-system", system }),
    );

    await act(async () => {
      await r1.current.send("ping");
    });
    unmount();

    const { result: r2 } = renderHook(() =>
      useChat({ provider, persist: true, persistId: "test-system", system }),
    );

    const systemMessages = r2.current.messages.filter((m) => m.role === "system");
    expect(systemMessages).toHaveLength(1);
  });
});
