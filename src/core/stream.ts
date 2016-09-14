import type { ChatDelta, FinishReason } from "./types";

// ─── Raw OpenAI chunk shape ───────────────────────────────────────────────────

interface RawToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface RawChoice {
  delta: {
    content?: string;
    tool_calls?: RawToolCallDelta[];
  };
  finish_reason: string | null;
}

interface RawChunk {
  choices: RawChoice[];
}

// ─── Stage 1: byte-stream → complete text lines ───────────────────────────────
// Handles UTF-8 boundaries (TextDecoder stream:true) and \r\n / \n / \r endings.

async function* decodeLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  try {
    for (;;) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      buf += done ? decoder.decode() : decoder.decode(value, { stream: !done });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        yield buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
      }
      if (done) {
        if (buf) yield buf.replace(/\r$/, "");
        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // stream already closed
    }
    reader.releaseLock();
  }
}

// ─── Stage 2: text lines → SSE data payloads ─────────────────────────────────
// Accumulates data: fields across event boundaries, emits on blank line.
// Stops on data: [DONE]. Ignores comment lines and non-data fields.

async function* extractSSEPayloads(lines: AsyncIterable<string>): AsyncIterable<string> {
  let accumulated = "";
  for await (const line of lines) {
    if (line.startsWith(":")) continue;
    if (line === "") {
      if (accumulated !== "") {
        yield accumulated;
        accumulated = "";
      }
      continue;
    }
    if (!line.startsWith("data:")) continue;
    const payload = line.length > 5 && line[5] === " " ? line.slice(6) : line.slice(5);
    if (payload === "[DONE]") return;
    accumulated = accumulated === "" ? payload : `${accumulated}\n${payload}`;
  }
  if (accumulated !== "") yield accumulated;
}

// ─── Stage 3: SSE payload string → ChatDelta[] ───────────────────────────────
// Handles all OpenAI streaming delta variants. Emits finish last so consumers
// can finalize tool-call accumulation before acting on finish_reason.

function parseSSEPayload(json: string): ChatDelta[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }

  const chunk = raw as Partial<RawChunk>;
  const choice = chunk?.choices?.[0];
  if (!choice) return [];

  const deltas: ChatDelta[] = [];

  if (choice.delta?.content) {
    deltas.push({ kind: "content", text: choice.delta.content });
  }

  for (const tc of choice.delta?.tool_calls ?? []) {
    if (tc.id !== undefined) {
      deltas.push({
        kind: "tool_call_start",
        index: tc.index,
        id: tc.id,
        name: tc.function?.name ?? "",
      });
    }
    if (tc.function?.arguments) {
      deltas.push({
        kind: "tool_call_args",
        index: tc.index,
        argumentsChunk: tc.function.arguments,
      });
    }
  }

  if (choice.finish_reason) {
    deltas.push({ kind: "finish", reason: choice.finish_reason as FinishReason });
  }

  return deltas;
}

// ─── Public pipeline: fetch body → AsyncIterable<ChatDelta> ──────────────────

export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<ChatDelta> {
  const lines = decodeLines(body, signal);
  const payloads = extractSSEPayloads(lines);
  for await (const payload of payloads) {
    yield* parseSSEPayload(payload);
  }
}
