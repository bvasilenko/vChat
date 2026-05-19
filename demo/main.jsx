import './styles.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chat, OpenAICompatibleProvider } from '@booga/vchat';

// Color/spacing/type + light-dark CSS variables come from @booga/vtheme's
// Tailwind preset (see tailwind.config.js). No manual theme wiring needed.
//
// The API key is read from VITE_OPENAI_KEY (see .env.example). It is supplied
// at the consumer's own .env.local, which is git-ignored — never committed.
const provider = new OpenAICompatibleProvider({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: import.meta.env.VITE_OPENAI_KEY,
  model: 'gpt-4o',
});

function App() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="page">
        <h1>Client app</h1>
        <p>The vChat component lives in a right-side drawer of this host app,
           rendered through the vsuite theme chain (vTheme &rarr; vUi &rarr; vChat).</p>
        <button className="open-btn" onClick={() => setOpen(true)}>Open chat</button>
      </div>
      <div className={'overlay' + (open ? ' show' : '')} onClick={() => setOpen(false)} />
      <aside className={'drawer bg-background text-foreground border-l border-border' + (open ? ' show' : '')}
             aria-hidden={!open}>
        <div className="bar bg-card text-card-foreground border-b border-border">
          <strong>Assistant &mdash; gpt-4o</strong>
          <button className="x text-foreground" onClick={() => setOpen(false)} aria-label="Close">&times;</button>
        </div>
        <div className="body">
          <Chat provider={provider} system="You are a helpful assistant." />
        </div>
      </aside>
    </>
  );
}
createRoot(document.getElementById('root')).render(<App />);
