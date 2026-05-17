// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect } from "vitest";
import { parseSSEStream } from "../src/core/stream";
import type { ChatDelta } from "../src";

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

async function collect(iter: AsyncIterable<ChatDelta>): Promise<ChatDelta[]> {
  const out: ChatDelta[] = [];
  for await (const d of iter) out.push(d);
  return out;
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

  it("emits finish delta with reason from finish_reason field", async () => {
    const stream = makeStream(
      sse(CONTENT_CHUNK("x")),
      sse(FINISH_CHUNK("stop")),
      "data: [DONE]\n\n",
    );
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas).toContainEqual({ kind: "finish", reason: "stop" });
  });

  it("stops consuming after [DONE] sentinel", async () => {
    const stream = makeStream(
      sse(CONTENT_CHUNK("a")),
      "data: [DONE]\n\n",
      sse(CONTENT_CHUNK("b")),
    );
    const deltas = await collect(parseSSEStream(stream));
    const texts = deltas.filter((d) => d.kind === "content").map((d) => (d as { text: string }).text);
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

  it("silently skips malformed JSON payloads", async () => {
    const stream = makeStream(
      "data: not-json\n\n",
      sse(CONTENT_CHUNK("good")),
      "data: [DONE]\n\n",
    );
    const deltas = await collect(parseSSEStream(stream));
    const content = deltas.filter((d) => d.kind === "content");
    expect(content).toHaveLength(1);
  });

  it("emits tool_call_start and tool_call_args deltas", async () => {
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
        delta: {
          tool_calls: [{ index: 0, function: { arguments: '{"loc":"NYC"}' } }],
        },
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
    expect(deltas.some((d) => d.kind === "tool_call_start")).toBe(true);
    expect(deltas.some((d) => d.kind === "tool_call_args")).toBe(true);
  });

  it("handles UTF-8 multibyte characters split across Uint8Array chunks", async () => {
    // "é" = U+00E9 = bytes 0xC3 0xA9; split the sequence across two enqueue calls
    const before = `data: {"choices":[{"delta":{"content":"caf`;
    const after = `"},"finish_reason":null}]}\n\ndata: [DONE]\n\n`;
    const stream = makeStream(
      before,
      new Uint8Array([0xc3]),
      new Uint8Array([0xa9]),
      after,
    );
    const deltas = await collect(parseSSEStream(stream));
    const content = deltas.find((d) => d.kind === "content");
    expect(content).toBeDefined();
    expect((content as { text: string }).text).toBe("café");
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

  it("does not process chunks when signal is already aborted before start", async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = makeStream(sse(CONTENT_CHUNK("never")), "data: [DONE]\n\n");
    const deltas = await collect(parseSSEStream(stream, controller.signal));
    expect(deltas.filter((d) => d.kind === "content")).toHaveLength(0);
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

  it("accumulates multi-line data: fields into one JSON payload", async () => {
    // SSE spec: multiple data: lines in one event are joined with \n (valid JSON whitespace)
    const line1 = `{"choices":[{"delta":{"content":"multi"},`;
    const line2 = `"finish_reason":null}]}`;
    const stream = makeStream(
      `data: ${line1}\ndata: ${line2}\n\n`,
      "data: [DONE]\n\n",
    );
    const deltas = await collect(parseSSEStream(stream));
    expect(deltas).toContainEqual({ kind: "content", text: "multi" });
  });
});
