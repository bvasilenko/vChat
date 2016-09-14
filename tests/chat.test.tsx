import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Provider } from "../src";

vi.mock("@booga/vui", () => ({
  Button: ({ children, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
  Textarea: ({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
  Select: ({ children, value, onChange, disabled, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { children?: React.ReactNode }) => (
    <select value={value} onChange={onChange} disabled={disabled} {...rest}>{children}</select>
  ),
  SelectItem: ({ children, value, ...rest }: React.OptionHTMLAttributes<HTMLOptionElement> & { children?: React.ReactNode }) => (
    <option value={value} {...rest}>{children}</option>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function makeInstantProvider(): Provider {
  return {
    async *chatStream() {
      yield { kind: "content", text: "Hi" };
      yield { kind: "finish", reason: "stop" };
    },
  };
}

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

  it("does not render ModelSelector when no models prop", async () => {
    const { Chat } = await import("../src/ui/Chat");
    render(<Chat provider={makeInstantProvider()} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders ModelSelector when models and onModelChange are provided", async () => {
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
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("does not render ModelSelector when models is empty", async () => {
    const { Chat } = await import("../src/ui/Chat");
    render(<Chat provider={makeInstantProvider()} models={[]} onModelChange={vi.fn()} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("applies className to the root div", async () => {
    const { Chat } = await import("../src/ui/Chat");
    const { container } = render(
      <Chat provider={makeInstantProvider()} className="my-chat" />,
    );
    expect(container.firstChild).toHaveClass("my-chat");
  });

  it("sends user message on form submit and displays it", async () => {
    const user = userEvent.setup();
    const { Chat } = await import("../src/ui/Chat");
    const { act } = await import("@testing-library/react");

    render(<Chat provider={makeInstantProvider()} />);

    await user.type(screen.getByRole("textbox"), "Hello");
    await act(async () => {
      await user.click(screen.getByRole("button"));
    });

    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
