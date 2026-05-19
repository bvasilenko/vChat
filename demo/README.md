# vChat drawer demo

A minimal host app that mounts `@booga/vchat`'s `<Chat>` in a right-side
drawer, themed through the vsuite chain (vTheme → vUi → vChat). It is a
review/reference app — not part of the published npm package (the package
`files` list ships only `dist/`).

## Run

```bash
cd demo
npm install
cp .env.example .env.local      # then put a real key in .env.local
npm run dev                     # http://localhost:5192
```

## API key — read this

The demo talks to the live OpenAI API. The key is read from `VITE_OPENAI_KEY`
in `.env.local`, which is **git-ignored** — it is never committed. Only the
`.env.example` placeholder is tracked.

`VITE_`-prefixed env vars are inlined into the client bundle by Vite, so the
key is visible in browser-delivered JS at runtime. For a demo on your own
machine that is acceptable; **use a throwaway, rotatable key**. For any shared
or hosted deployment, front the provider with a server-side proxy instead of
shipping the key to the client.

## Theming

`tailwind.config.js` applies `@booga/vtheme/preset` — the full color, spacing
and type contract plus light/dark CSS variables. No manual theme wiring.
