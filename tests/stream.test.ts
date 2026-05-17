// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect } from "vitest";
import { parseSSEStream } from "../src/core/stream";
import type { ChatDelta } from "../src";
import { collect } from "./helpers";

const enc = new TextEncoder();

function makeStream(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? enc.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

function sse(payload: string): string {
  return `data: ${payload}\n\n`;
}

const CONTENT_CHUNK = (text: string) =>
  JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] });

const FINISH_CHUNK = (reason = "stop") =>
  JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] });

describe("parseSSEStream", () => {
  it("emits content delta from a data: line", async () => {
    const stream = makeStream(sse(CONTENT_CHUNK("hello")), "data: [DONE]\n\n");
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas).toContainEqual({ kind: "content", text: "hello" });
  });

  it("passes finish_reason through as the finish delta reason for all valid values", async () => {
    const reasons = ["stop", "tool_calls", "length", "content_filter"] as const;
    for (const reason of reasons) {
      const stream = makeStream(sse(FINISH_CHUNK(reason)), "data: [DONE]\n\n");
      const deltas = await collect(parseSSEStream(stream));
      expect(deltas).toContainEqual({ kind: "finish", reason });
    }
  });

  it("stops consuming after [DONE] sentinel", async () => {
    const stream = makeStream(
      sse(CONTENT_CHUNK("a")),
      "data: [DONE]\n\n",
      sse(CONTENT_CHUNK("b")),
    );
    const deltas = await collect(parseSSEStream(stream));
    const texts = deltas
      .filter((d) => d.kind === "content")
      .map((d) => (d as Extract<ChatDelta, { kind: "content" }>).text);
    expect(texts).toEqual(["a"]);
  });

  it("ignores SSE comment lines starting with ':'", async () => {
    const stream = makeStream(
      ": keep-alive\n",
      sse(CONTENT_CHUNK("ok")),
      "data: [DONE]\n\n",
    );
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas.filter((d) => d.kind === "content")).toHaveLength(1);
  });

  it("silently skips malformed JSON payloads and continues the stream", async () => {
    const stream = makeStream(
      "data: not-json\n\n",
      sse(CONTENT_CHUNK("good")),
      "data: [DONE]\n\n",
    );
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas.filter((d) => d.kind === "content")).toHaveLength(1);
  });

  it("skips choices-less JSON payloads without error", async () => {
    const stream = makeStream(
      `data: {"id":"x"}\n\n`,
      sse(CONTENT_CHUNK("ok")),
      "data: [DONE]\n\n",
    );
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas).toContainEqual({ kind: "content", text: "ok" });
  });

  it("emits tool_call_start and tool_call_args deltas for a single tool call", async () => {
    const toolStartChunk = JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_weather", arguments: "" } }],
        },
        finish_reason: null,
      }],
    });
    const toolArgsChunk = JSON.stringify({
      choices: [{
        delta: { tool_calls: [{ index: 0, function: { arguments: '{"loc":"NYC"}' } }] },
        finish_reason: null,
      }],
    });
    const stream = makeStream(
      sse(toolStartChunk),
      sse(toolArgsChunk),
      sse(FINISH_CHUNK("tool_calls")),
      "data: [DONE]\n\n",
    );
    const deltas = await collect(parseSSEStream(stream));
    const start = deltas.find((d) => d.kind === "tool_call_start");
    const args = deltas.find((d) => d.kind === "tool_call_args");
    expect(start).toBeDefined();
    expect(args).toBeDefined();
  });

  it("emits tool_call_start deltas for multiple simultaneous tool calls at different indices", async () => {
    const chunk = JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [
            { index: 0, id: "call_a", type: "function", function: { name: "tool_a", arguments: "" } },
            { index: 1, id: "call_b", type: "function", function: { name: "tool_b", arguments: "" } },
          ],
        },
        finish_reason: null,
      }],
    });
    const stream = makeStream(sse(chunk), sse(FINISH_CHUNK("tool_calls")), "data: [DONE]\n\n");
    const deltas = await collect(parseSSEStream(stream));
    const starts = deltas.filter((d) => d.kind === "tool_call_start") as Extract<ChatDelta, { kind: "tool_call_start" }>[];
    expect(starts).toHaveLength(2);
    expect(starts.map((d) => d.index).sort()).toEqual([0, 1]);
  });

  it("handles UTF-8 multibyte characters split across Uint8Array chunks", async () => {
    const before = `data: {"choices":[{"delta":{"content":"caf`;
    const after = `"},"finish_reason":null}]}\n\ndata: [DONE]\n\n`;
    const stream = makeStream(
      before,
      new Uint8Array([0xc3]),
      new Uint8Array([0xa9]),
      after,
    );
    const deltas = await collect(parseSSEStream(stream));
    const content = deltas.find((d) => d.kind === "content") as Extract<ChatDelta, { kind: "content" }> | undefined;
    expect(content?.text).toBe("café");
  });

  it("handles bare \\r line endings per SSE spec", async () => {
    const payload = CONTENT_CHUNK("cr");
    const stream = makeStream(`data: ${payload}\r\r`, "data: [DONE]\r\r");
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas).toContainEqual({ kind: "content", text: "cr" });
  });

  it("handles \\r\\n line endings", async () => {
    const payload = CONTENT_CHUNK("rn");
    const stream = makeStream(`data: ${payload}\r\n\r\n`, "data: [DONE]\r\n\r\n");
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas).toContainEqual({ kind: "content", text: "rn" });
  });

  it("emits trailing payload when stream ends without final blank line", async () => {
    const payload = CONTENT_CHUNK("trailing");
    const stream = makeStream(`data: ${payload}\n`);
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas).toContainEqual({ kind: "content", text: "trailing" });
  });

  it("handles data: field without space after colon", async () => {
    const payload = CONTENT_CHUNK("nospace");
    const stream = makeStream(`data:${payload}\n\n`, "data: [DONE]\n\n");
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas).toContainEqual({ kind: "content", text: "nospace" });
  });

  it("accumulates multi-line data: fields into one JSON payload", async () => {
    const line1 = `{"choices":[{"delta":{"content":"multi"},`;
    const line2 = `"finish_reason":null}]}`;
    const stream = makeStream(
      `data: ${line1}\ndata: ${line2}\n\n`,
      "data: [DONE]\n\n",
    );
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas).toContainEqual({ kind: "content", text: "multi" });
  });

  it("does not process chunks when signal is already aborted before start", async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = makeStream(sse(CONTENT_CHUNK("never")), "data: [DONE]\n\n");
    const deltas = await collect(parseSSEStream(stream, controller.signal));
    expect(deltas.filter((d) => d.kind === "content")).toHaveLength(0);
  });
});
