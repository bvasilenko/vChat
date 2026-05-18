// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { cn } from "./cn";
import type { ChatMessage } from "../core/types";

export interface ChatMessagesProps {
  readonly messages: ChatMessage[];
  readonly className?: string;
}

export function ChatMessages({ messages, className }: ChatMessagesProps) {
  const visible = messages.filter((m) => m.role !== "system");

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
      className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4", className)}
    >
      {visible.map((msg, i) => (
        <div
          key={i}
          role="article"
          data-role={msg.role}
          className={cn(
            "max-w-[85%] rounded-lg px-3 py-2 text-sm",
            msg.role === "user"
              ? "self-end bg-primary text-primary-foreground"
              : "self-start bg-muted text-foreground",
          )}
        >
          {msg.role === "assistant" || msg.role === "user" ? (
            <span>{msg.content}</span>
          ) : (
            <span aria-label="Tool result">{msg.content}</span>
          )}
        </div>
      ))}
    </div>
  );
}
