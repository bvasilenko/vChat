// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import type { Provider, Tool } from "../core/types";
import { useChat } from "../hooks/useChat";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "./ModelSelector";

export interface ChatProps {
  readonly provider: Provider;
  readonly tools?: Tool[];
  readonly system?: string;
  readonly models?: string[];
  readonly onModelChange?: (model: string) => void;
  readonly selectedModel?: string;
  readonly persist?: boolean;
  readonly persistId?: string;
  readonly className?: string;
}

export function Chat({
  provider,
  tools,
  system,
  models,
  onModelChange,
  selectedModel,
  persist,
  persistId,
  className,
}: ChatProps) {
  const { messages, send, status } = useChat({
    provider,
    tools,
    system,
    persist,
    persistId,
  });

  const isStreaming = status === "sending" || status === "streaming";

  return (
    <div className={className} aria-label="Chat">
      {models && models.length > 0 && onModelChange && (
        <ModelSelector
          models={models}
          value={selectedModel ?? models[0] ?? ""}
          onChange={onModelChange}
          disabled={isStreaming}
        />
      )}
      <ChatMessages messages={messages} />
      <ChatInput
        onSubmit={send}
        disabled={isStreaming}
      />
    </div>
  );
}
