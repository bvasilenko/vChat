import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useLocalStorage } from "@booga/vhooks";
import type { Provider, Tool, ChatMessage, ChatDelta, FinishReason, ToolCall } from "../core/types";
import { buildToolsMap, executeToolCalls, ToolRoundLimitError } from "../core/tools";

// ─── Public types ─────────────────────────────────────────────────────────────

export type ChatStatus = "idle" | "sending" | "streaming" | "error";

export interface UseChatOptions {
  readonly provider: Provider;
  readonly tools?: readonly Tool[];
  readonly system?: string;
  readonly persist?: boolean;
  readonly persistId?: string;
  readonly maxToolRounds?: number;
}

export interface UseChatReturn {
  readonly messages: ChatMessage[];
  readonly send: (text: string) => Promise<void>;
  readonly abort: () => void;
  readonly status: ChatStatus;
  readonly error: Error | null;
}

// ─── Streaming-turn accumulator ───────────────────────────────────────────────

interface ToolCallEntry {
  id: string;
  name: string;
  arguments: string;
}

function safeParseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function assemblAssistantMessage(
  content: string,
  toolCallsById: Map<number, ToolCallEntry>,
): ChatMessage & { role: "assistant" } {
  const toolCalls: ToolCall[] = Array.from(toolCallsById.values()).map((tc) => ({
    id: tc.id,
    name: tc.name,
    arguments: safeParseJSON(tc.arguments),
  }));

  return {
    role: "assistant",
    content,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

// One streaming turn: drives provider.chatStream, calls back for real-time UI updates.
// Returns the fully assembled assistant message and the finish reason.
async function runStreamingTurn(
  provider: Provider,
  messages: readonly ChatMessage[],
  tools: ReadonlyMap<string, Tool>,
  signal: AbortSignal,
  onContentDelta: (text: string) => void,
  onStreamingStarted: () => void,
): Promise<{ assistantMessage: ChatMessage & { role: "assistant" }; finishReason: FinishReason }> {
  let content = "";
  const toolCallsById = new Map<number, ToolCallEntry>();
  let finishReason: FinishReason = "stop";

  const request = {
    messages,
    tools: tools.size > 0 ? Array.from(tools.values()) : undefined,
    signal,
  };

  for await (const delta of provider.chatStream(request)) {
    finishReason = applyDeltaToAccumulator(
      delta,
      content,
      toolCallsById,
      onContentDelta,
      onStreamingStarted,
      (c) => { content = c; },
      finishReason,
    );
  }

  return {
    assistantMessage: assemblAssistantMessage(content, toolCallsById),
    finishReason,
  };
}

function applyDeltaToAccumulator(
  delta: ChatDelta,
  content: string,
  toolCallsById: Map<number, ToolCallEntry>,
  onContentDelta: (text: string) => void,
  onStreamingStarted: () => void,
  setContent: (c: string) => void,
  currentFinishReason: FinishReason,
): FinishReason {
  switch (delta.kind) {
    case "content":
      setContent(content + delta.text);
      onStreamingStarted();
      onContentDelta(delta.text);
      return currentFinishReason;
    case "tool_call_start":
      toolCallsById.set(delta.index, { id: delta.id, name: delta.name, arguments: "" });
      return currentFinishReason;
    case "tool_call_args": {
      const entry = toolCallsById.get(delta.index);
      if (entry) entry.arguments += delta.argumentsChunk;
      return currentFinishReason;
    }
    case "finish":
      return delta.reason;
  }
}

// ─── Immutable message list helpers ──────────────────────────────────────────

function appendTextToLastAssistant(messages: ChatMessage[], text: string): ChatMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== "assistant") return messages;
  return [...messages.slice(0, -1), { ...last, content: last.content + text }];
}

function replaceLastAssistant(
  messages: ChatMessage[],
  replacement: ChatMessage & { role: "assistant" },
): ChatMessage[] {
  if (messages.length === 0) return [replacement];
  const last = messages[messages.length - 1];
  if (last.role !== "assistant") return [...messages, replacement];
  return [...messages.slice(0, -1), replacement];
}

// ─── Persistence shim ─────────────────────────────────────────────────────────
// useLocalStorage must always be called (Rules of Hooks). The noop key is only
// used when persistence is disabled — localStorage is never written in that case.

function useChatPersistence(
  enabled: boolean,
  persistId: string | undefined,
  fallback: ChatMessage[],
): [ChatMessage[], (msgs: ChatMessage[]) => void] {
  const key = enabled && persistId ? `vchat:${persistId}` : "vchat:__noop__";
  const [stored, setStored] = useLocalStorage<ChatMessage[]>(key, fallback);
  if (!enabled || !persistId) return [fallback, () => {}];
  return [stored, setStored];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChat(opts: UseChatOptions): UseChatReturn {
  const maxToolRounds = opts.maxToolRounds ?? 10;

  const toolsMap = useMemo(
    () => buildToolsMap(opts.tools ?? []),
    [JSON.stringify((opts.tools ?? []).map((t) => t.name))],
  );

  const systemMessages: ChatMessage[] = useMemo(
    () => (opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    [opts.system],
  );

  const [persistedMessages, setPersistedMessages] = useChatPersistence(
    opts.persist ?? false,
    opts.persistId,
    systemMessages,
  );

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    opts.persist && opts.persistId && persistedMessages.length > 0
      ? persistedMessages
      : systemMessages,
  );

  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const statusRef = useRef(status);
  statusRef.current = status;

  const controllerRef = useRef<AbortController | null>(null);

  // Sync to localStorage after every messages change (avoid stale-ref writes).
  useEffect(() => {
    if (opts.persist && opts.persistId) {
      setPersistedMessages(messages);
    }
  }, [messages, opts.persist, opts.persistId, setPersistedMessages]);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (statusRef.current !== "idle") return;

      const controller = new AbortController();
      controllerRef.current = controller;

      setStatus("sending");
      setError(null);

      // Read current messages synchronously (ref is current at call time).
      const existingNonSystem = messagesRef.current.filter((m) => m.role !== "system");
      const baseHistory: ChatMessage[] = [
        ...systemMessages,
        ...existingNonSystem,
        { role: "user", content: text },
      ];

      setMessages([...baseHistory, { role: "assistant" as const, content: "" }]);

      let workingHistory: ChatMessage[] = baseHistory;

      try {
        for (let round = 0; round <= maxToolRounds; round++) {
          if (round === maxToolRounds) throw new ToolRoundLimitError(maxToolRounds);

          const { assistantMessage, finishReason } = await runStreamingTurn(
            opts.provider,
            workingHistory,
            toolsMap,
            controller.signal,
            (deltaText) => {
              setMessages((prev) => appendTextToLastAssistant(prev, deltaText));
            },
            () => setStatus("streaming"),
          );

          workingHistory = [...workingHistory, assistantMessage];

          if (finishReason !== "tool_calls" || toolsMap.size === 0) {
            // Functional form guarantees we replace the latest state, not a stale ref.
            setMessages((prev) => replaceLastAssistant(prev, assistantMessage));
            break;
          }

          if (controller.signal.aborted) break;

          const toolMessages = await executeToolCalls(
            assistantMessage.toolCalls ?? [],
            toolsMap,
            controller.signal,
          );

          if (controller.signal.aborted) break;

          workingHistory = [...workingHistory, ...toolMessages];

          setMessages((prev) => [
            ...replaceLastAssistant(prev, assistantMessage),
            ...toolMessages,
            { role: "assistant" as const, content: "" },
          ]);
        }

        setStatus("idle");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setStatus("idle");
        } else {
          setError(err instanceof Error ? err : new Error(String(err)));
          setStatus("error");
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [opts.provider, systemMessages, toolsMap, maxToolRounds],
  );

  return { messages, send, abort, status, error };
}
