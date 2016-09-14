import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { OpenAICompatibleProvider } from "../src/core/openai-compatible";
import type { ChatRequest, ChatDelta, Tool } from "../src";

const enc = new TextEncoder();

function makeSseBody(...events: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(enc.encode(e));
      }
      controller.close();
    },
  });
}

function sseEvent(payload: object): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function mockOkResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function collect(iter: AsyncIterable<ChatDelta>): Promise<ChatDelta[]> {
  const out: ChatDelta[] = [];
  for await (const d of iter) out.push(d);
  return out;
}

const opts = { baseUrl: "https://api.example.com", apiKey: "sk-test", model: "gpt-4o" };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAICompatibleProvider", () => {
  it("yields content deltas from a streaming response", async () => {
    const body = makeSseBody(
      sseEvent({ choices: [{ delta: { content: "hello" }, finish_reason: null }] }),
      sseEvent({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      "data: [DONE]\n\n",
    );
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse(body));

    const provider = new OpenAICompatibleProvider(opts);
    const request: ChatRequest = {
      messages: [{ role: "user", content: "hi" }],
    };
    const deltas = await collect(provider.chatStream(request));
    expect(deltas).toContainEqual({ kind: "content", text: "hello" });
    expect(deltas).toContainEqual({ kind: "finish", reason: "stop" });
  });

  it("throws when response status is not ok", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    const provider = new OpenAICompatibleProvider(opts);
    const request: ChatRequest = { messages: [{ role: "user", content: "hi" }] };
    await expect(collect(provider.chatStream(request))).rejects.toThrow("401");
  });

  it("throws when response body is null", async () => {
    const response = new Response(null, { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(response);

    const provider = new OpenAICompatibleProvider(opts);
    const request: ChatRequest = { messages: [{ role: "user", content: "hi" }] };
    await expect(collect(provider.chatStream(request))).rejects.toThrow("empty response body");
  });

  it("includes tools in the request body when provided", async () => {
    const body = makeSseBody("data: [DONE]\n\n");
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse(body));

    const tool: Tool = {
      name: "get_weather",
      description: "Get temperature",
      schema: z.object({ location: z.string() }),
      execute: async () => ({ temp: 72 }),
    };

    const provider = new OpenAICompatibleProvider(opts);
    const request: ChatRequest = {
      messages: [{ role: "user", content: "weather?" }],
      tools: [tool],
    };
    await collect(provider.chatStream(request));

    const [, fetchInit] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse((fetchInit as RequestInit).body as string);
    expect(sent.tools).toHaveLength(1);
    expect(sent.tools[0].function.name).toBe("get_weather");
    expect(sent.tool_choice).toBe("auto");
  });

  it("does not include tools field when no tools provided", async () => {
    const body = makeSseBody("data: [DONE]\n\n");
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse(body));

    const provider = new OpenAICompatibleProvider(opts);
    const request: ChatRequest = { messages: [{ role: "user", content: "hi" }] };
    await collect(provider.chatStream(request));

    const [, fetchInit] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse((fetchInit as RequestInit).body as string);
    expect(sent.tools).toBeUndefined();
    expect(sent.tool_choice).toBeUndefined();
  });

  it("converts tool-role messages with tool_call_id", async () => {
    const body = makeSseBody("data: [DONE]\n\n");
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse(body));

    const provider = new OpenAICompatibleProvider(opts);
    const request: ChatRequest = {
      messages: [
        { role: "user", content: "hi" },
        { role: "tool", toolCallId: "call_123", content: '{"temp":72}' },
      ],
    };
    await collect(provider.chatStream(request));

    const [, fetchInit] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse((fetchInit as RequestInit).body as string);
    const toolMsg = sent.messages.find((m: { role: string }) => m.role === "tool");
    expect(toolMsg.tool_call_id).toBe("call_123");
  });

  it("converts assistant messages with toolCalls to wire format", async () => {
    const body = makeSseBody("data: [DONE]\n\n");
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse(body));

    const provider = new OpenAICompatibleProvider(opts);
    const request: ChatRequest = {
      messages: [
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "get_weather", arguments: { location: "NYC" } }],
        },
      ],
    };
    await collect(provider.chatStream(request));

    const [, fetchInit] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse((fetchInit as RequestInit).body as string);
    const asstMsg = sent.messages[0];
    expect(asstMsg.tool_calls).toHaveLength(1);
    expect(asstMsg.tool_calls[0].function.name).toBe("get_weather");
  });

  it("sends Authorization header with bearer token", async () => {
    const body = makeSseBody("data: [DONE]\n\n");
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse(body));

    const provider = new OpenAICompatibleProvider(opts);
    await collect(provider.chatStream({ messages: [{ role: "user", content: "hi" }] }));

    const [, fetchInit] = vi.mocked(fetch).mock.calls[0];
    expect((fetchInit as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk-test",
    });
  });
});
