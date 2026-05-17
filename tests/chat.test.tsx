// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeInstantProvider } from "./helpers";

vi.mock("@booga/vui");

describe("Chat component", () => {
  it("renders a textarea for input and a submit button", async () => {
    const { Chat } = await import("../src/ui/Chat");
    render(<Chat provider={makeInstantProvider()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders the chat messages region", async () => {
    const { Chat } = await import("../src/ui/Chat");
    render(<Chat provider={makeInstantProvider()} />);
    expect(screen.getByRole("log")).toBeInTheDocument();
  });

  it("does not render ModelSelector when no models prop is provided", async () => {
    const { Chat } = await import("../src/ui/Chat");
    render(<Chat provider={makeInstantProvider()} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("does not render ModelSelector when models is an empty array", async () => {
    const { Chat } = await import("../src/ui/Chat");
    render(<Chat provider={makeInstantProvider()} models={[]} onModelChange={vi.fn()} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("does not render ModelSelector when models are provided but onModelChange is absent", async () => {
    const { Chat } = await import("../src/ui/Chat");
    render(<Chat provider={makeInstantProvider()} models={["gpt-4o"]} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders ModelSelector when models and onModelChange are both provided", async () => {
    const { Chat } = await import("../src/ui/Chat");
    render(
      <Chat
        provider={makeInstantProvider()}
        models={["gpt-4o", "gpt-3.5"]}
        onModelChange={vi.fn()}
        selectedModel="gpt-4o"
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("onModelChange fires with the selected model value", async () => {
    const { Chat } = await import("../src/ui/Chat");
    const onModelChange = vi.fn();
    render(
      <Chat
        provider={makeInstantProvider()}
        models={["gpt-4o", "gpt-3.5"]}
        onModelChange={onModelChange}
        selectedModel="gpt-4o"
      />,
    );
    await userEvent.selectOptions(screen.getByRole("combobox"), "gpt-3.5");
    expect(onModelChange).toHaveBeenCalledWith("gpt-3.5");
  });

  it("applies className to the root element", async () => {
    const { Chat } = await import("../src/ui/Chat");
    const { container } = render(
      <Chat provider={makeInstantProvider()} className="my-chat" />,
    );
    expect(container.firstChild).toHaveClass("my-chat");
  });

  it("sends user message on form submit and displays it in the message list", async () => {
    const user = userEvent.setup();
    const { Chat } = await import("../src/ui/Chat");

    render(<Chat provider={makeInstantProvider()} />);

    await user.type(screen.getByRole("textbox"), "Hello");
    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
