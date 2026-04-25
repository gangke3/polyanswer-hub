# Setup Notes

## Planned Dependencies

- Electron
- React
- TypeScript
- Playwright
- SQLite driver
- Drizzle ORM
- Zustand

## Package Manager

Use `npm` for now because it is already available in the current environment. The workspace layout is compatible with npm workspaces.

## Local Run Goal

The first runnable milestone is:

1. start Electron shell
2. load provider metadata
3. submit a fake in-memory task
4. show placeholder answers

## Real Automation Goal

After dependencies are installed and provider selectors are implemented:

1. open real browser context
2. complete manual login
3. reuse session profile
4. submit prompt to each provider
5. extract text and persist results

## Playwright Browser Install

The project now depends on Playwright. Before testing real browser automation, run:

```bash
npx playwright install chromium
```

## Current Real Provider Coverage

- ChatGPT: first real browser automation path is implemented
- Gemini: skeleton only
- Kimi: skeleton only
- Doubao: skeleton only

## ChatGPT Flow Today

1. Launch a persistent Chromium profile from `data/sessions/chatgpt`
2. Open `https://chatgpt.com/`
3. If not logged in, wait for manual login in the visible browser
4. Find the composer
5. Submit the prompt
6. Poll the latest assistant response until it stabilizes
7. Save page HTML and screenshot into `data/snapshots/chatgpt`
