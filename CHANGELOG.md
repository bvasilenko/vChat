# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-18

### Changed

- `@booga/vui` and `@booga/vforms` dependencies raised to `^0.2.0`. Those packages now resolve their color classes through `@booga/vtheme`'s semantic role contract, so chat UI renders correctly once the consumer applies vTheme's Tailwind preset (`presets: [require("@booga/vtheme/preset")]`).

## [0.1.0] - 2026-05-17

### Added

- `Provider` interface — `chatStream(req): AsyncIterable<ChatDelta>`
- `OpenAICompatibleProvider` — fetch + SSE stream, zod-to-json-schema tool conversion
- `parseSSEStream` — byte-accurate SSE parser: UTF-8 boundaries, multi-line data, `[DONE]` sentinel
- `Tool` interface with Zod schema validation and parallel batch execution
- `useChat` hook — streaming delta accumulation, tool dispatch loop, abort, optional localStorage persistence
- `Chat`, `ChatMessages`, `ChatInput`, `ModelSelector` composable React components
- `ChatMessageSchema`, `ToolSchema`, `ToolCallSchema` Zod schemas
- Typed errors: `ToolNotFoundError`, `ToolArgumentsError`, `ToolRoundLimitError`
