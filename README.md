# vChat

Chat UI layer. Provider-agnostic: plug in any OpenAI-compatible endpoint. Streaming deltas render in-place. Tool calls dispatch, validate with Zod, feed results back. Accessible by default — aria-live, role=log, labelled inputs.

## Install

```sh
bun add @booga/vchat
```

## Usage

```tsx
import { Chat, OpenAICompatibleProvider } from "@booga/vchat";

const provider = new OpenAICompatibleProvider({
  baseUrl: "https://api.openai.com/v1",
  apiKey: process.env.OPENAI_KEY,
  model: "gpt-4o",
});

export default function App() {
  return <Chat provider={provider} system="You are helpful." />;
}
```

## Composable parts

```tsx
import { useChat, ChatMessages, ChatInput, ModelSelector } from "@booga/vchat";

const { messages, send, abort, status } = useChat({ provider, tools, system });
```

## Tool calls

```tsx
import { z } from "zod";
import type { Tool } from "@booga/vchat";

const weatherTool: Tool = {
  name: "get_weather",
  description: "Current temperature for a location.",
  schema: z.object({ location: z.string() }),
  execute: async ({ location }) => fetchWeather(location),
};

<Chat provider={provider} tools={[weatherTool]} />
```

## Persistence

```tsx
<Chat provider={provider} persist persistId="my-chat" />
```

History stored in `localStorage`, restored on mount.

## Provider interface

```ts
interface Provider {
  chatStream(request: ChatRequest): AsyncIterable<ChatDelta>;
}
```

Implement this interface to connect any backend — OpenAI-compatible, Ollama, local proxy, mock.

## Code of conduct

Contributor Covenant 2.1 — https://www.contributor-covenant.org/version/2/1/code_of_conduct/

## License

MIT © 2026 bvasilenko
