import type { ChatMessage } from "../core/types";

export interface ChatMessagesProps {
  readonly messages: ChatMessage[];
  readonly className?: string;
}

export function ChatMessages({ messages, className }: ChatMessagesProps) {
  const visible = messages.filter((m) => m.role !== "system");

  return (
    <div role="log" aria-live="polite" aria-label="Chat messages" className={className}>
      {visible.map((msg, i) => (
        <div key={i} role="article" data-role={msg.role}>
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
