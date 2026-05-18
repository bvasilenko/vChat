# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-05-18

### Fixed

- `ChatInput`: the Send button could be pushed past the container's right edge. The textarea (`w-full` from vUi) was a flex sibling of the button with no flex constraint, so it claimed the full row width. The textarea is now wrapped in a `min-w-0 flex-1` element (the wrapper grows/shrinks; `min-w-0` permits shrinking below content width) and the Send button is `shrink-0`. Verified: Send sits fully inside the container with the row's padding intact.

## [0.2.1] - 2026-05-18

### Fixed

- Components shipped layout-naked: `Chat`, `ChatMessages`, `ChatInput` rendered bare `<div className={className}>` with no default styling, so `<Chat provider={...} />` (the documented one-liner) rendered cramped and unstructured. They now carry sensible default layout — `Chat` is a flex column filling its container, `ChatMessages` is a scrollable padded log with gap and per-message bubbles (`primary` for user, `muted` for assistant/tool), `ChatInput` is a padded row with a top border and a gap between textarea and Send. Consumer `className` still overrides via `cn()`.
- Added a local `cn` (clsx + tailwind-merge) instead of importing it from `@booga/vui`, avoiding a vitest SSR interop quirk with vUi's multi-chunk re-exports.

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
