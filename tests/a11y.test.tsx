// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMessage } from "../src";

vi.mock("@booga/vui", () => ({
  Button: ({ children, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
  Textarea: ({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
  Select: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children?: React.ReactNode }) => (
    <select {...props}>{children}</select>
  ),
  SelectItem: ({ children, ...props }: React.OptionHTMLAttributes<HTMLOptionElement> & { children?: React.ReactNode }) => (
    <option {...props}>{children}</option>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Accessibility", () => {
  describe("ChatMessages", () => {
    it("has role=log for screen reader live region", async () => {
      const { ChatMessages } = await import("../src/ui/ChatMessages");
      const messages: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ];
      render(<ChatMessages messages={messages} />);
      expect(screen.getByRole("log")).toBeInTheDocument();
    });

    it("has aria-live=polite so assistive tech announces new messages", async () => {
      const { ChatMessages } = await import("../src/ui/ChatMessages");
      render(<ChatMessages messages={[]} />);
      expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
    });

    it("renders user and assistant messages as articles", async () => {
      const { ChatMessages } = await import("../src/ui/ChatMessages");
      const messages: ChatMessage[] = [
        { role: "user", content: "Q" },
        { role: "assistant", content: "A" },
      ];
      render(<ChatMessages messages={messages} />);
      expect(screen.getAllByRole("article")).toHaveLength(2);
    });

    it("omits system messages from the rendered list", async () => {
      const { ChatMessages } = await import("../src/ui/ChatMessages");
      const messages: ChatMessage[] = [
        { role: "system", content: "hidden" },
        { role: "user", content: "visible" },
      ];
      render(<ChatMessages messages={messages} />);
      expect(screen.queryByText("hidden")).not.toBeInTheDocument();
      expect(screen.getByText("visible")).toBeInTheDocument();
    });
  });

  describe("ChatInput", () => {
    it("contains a labelled textarea", async () => {
      const { ChatInput } = await import("../src/ui/ChatInput");
      render(<ChatInput onSubmit={vi.fn()} disabled={false} />);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("contains a send button", async () => {
      const { ChatInput } = await import("../src/ui/ChatInput");
      render(<ChatInput onSubmit={vi.fn()} disabled={false} />);
      expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
    });

    it("send button is disabled when input is empty", async () => {
      const { ChatInput } = await import("../src/ui/ChatInput");
      render(<ChatInput onSubmit={vi.fn()} disabled={false} />);
      expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    });

    it("send button becomes enabled after typing", async () => {
      const { ChatInput } = await import("../src/ui/ChatInput");
      render(<ChatInput onSubmit={vi.fn()} disabled={false} />);

      await userEvent.type(screen.getByRole("textbox"), "hello");
      expect(screen.getByRole("button", { name: /send/i })).toBeEnabled();
    });

    it("send button is disabled when disabled prop is true regardless of input", async () => {
      const { ChatInput } = await import("../src/ui/ChatInput");
      render(<ChatInput onSubmit={vi.fn()} disabled={true} />);
      await userEvent.type(screen.getByRole("textbox"), "hello");
      expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    });

    it("calls onSubmit with the typed text when button is clicked", async () => {
      const { ChatInput } = await import("../src/ui/ChatInput");
      const onSubmit = vi.fn();
      render(<ChatInput onSubmit={onSubmit} disabled={false} />);

      await userEvent.type(screen.getByRole("textbox"), "greetings");
      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      expect(onSubmit).toHaveBeenCalledWith("greetings");
    });

    it("clears input after submit", async () => {
      const { ChatInput } = await import("../src/ui/ChatInput");
      render(<ChatInput onSubmit={vi.fn()} disabled={false} />);
      const textarea = screen.getByRole("textbox");

      await userEvent.type(textarea, "msg");
      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      expect(textarea).toHaveValue("");
    });
  });

  describe("ModelSelector", () => {
    it("renders a labelled select with model options", async () => {
      const { ModelSelector } = await import("../src/ui/ModelSelector");
      render(
        <ModelSelector
          models={["gpt-4", "gpt-3.5-turbo"]}
          value="gpt-4"
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByRole("combobox", { name: /select model/i })).toBeInTheDocument();
      expect(screen.getByText("gpt-4")).toBeInTheDocument();
      expect(screen.getByText("gpt-3.5-turbo")).toBeInTheDocument();
    });
  });
});
