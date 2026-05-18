# Setup Notes

## Planned Dependencies

- Electron
- React
- TypeScript
- Playwright
- SQLite driver
- Drizzle ORM
- Zustand
- Nodemailer

## Package Manager

Use `npm` for now because it is already available in the current environment. The workspace layout is compatible with npm workspaces.

## Local Run Goal

The runnable desktop flow is:

1. start the Electron shell
2. load provider metadata and app settings
3. open visible provider login tabs
4. submit a prompt to selected providers
5. show provider answers and a synthesized result
6. save task history locally when enabled

## Real Automation Goal

The current browser automation goal is:

1. open real browser context
2. complete manual login
3. reuse session profile
4. submit prompt to each provider
5. extract text and persist results

## Current Real Provider Coverage

- ChatGPT: browser automation adapter
- Claude: experimental browser automation adapter
- Gemini: experimental browser automation adapter
- Kimi: experimental browser automation adapter
- Doubao: experimental browser automation adapter
- Grok: experimental browser automation adapter

## Browser Flow Today

1. Launch or attach to a shared native Chrome / Edge profile under `data/sessions/shared-browser-native`
2. Open each provider's login or home page in a visible tab
3. If not logged in, wait for manual login or verification in the visible browser
4. Find the provider composer
5. Submit the prompt
6. Poll the latest assistant response until it stabilizes
7. Save page HTML and screenshots into `data/snapshots/<provider>`
