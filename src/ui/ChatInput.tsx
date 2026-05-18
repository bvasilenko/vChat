// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { useState, type KeyboardEvent } from "react";
import { Button, Textarea } from "@booga/vui";
import { cn } from "./cn";

export interface ChatInputProps {
  readonly onSubmit: (text: string) => void;
  readonly disabled: boolean;
  readonly placeholder?: string;
  readonly className?: string;
}

export function ChatInput({
  onSubmit,
  disabled,
  placeholder = "Type a message…",
  className,
}: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className={cn("flex items-end gap-2 border-t border-border p-3", className)}
      role="group"
      aria-label="Message input"
    >
      <label htmlFor="vchat-input" className="sr-only">
        Message
      </label>
      <Textarea
        id="vchat-input"
        className="flex-1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label="Message"
      />
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || value.trim().length === 0}
        aria-label="Send message"
      >
        Send
      </Button>
    </div>
  );
}
