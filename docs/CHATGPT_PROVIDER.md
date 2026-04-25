# ChatGPT Provider Notes

## What Is Implemented

- Persistent Playwright Chromium profile
- Visible browser session for manual login
- Basic login detection using prompt-area presence
- Prompt submission using composer + send button fallback
- Completion wait using latest assistant message stabilization
- Snapshot capture to local files

## Known Limits

- ChatGPT DOM can change and break selectors
- Completion detection is heuristic, not event-driven
- The provider currently assumes one active page per provider session
- It does not yet record rich metadata like citations, model name, or stop reason

## First Real Test Checklist

1. Run `npx playwright install chromium`
2. Start the desktop app
3. Trigger a ChatGPT-only task
4. Log in manually when the visible browser opens
5. Confirm the answer appears in the app
6. Check that snapshot files exist under `data/snapshots/chatgpt`

