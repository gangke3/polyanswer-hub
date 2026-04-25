# PolyAnswer Hub

PolyAnswer Hub is a local-first Windows desktop app for asking one question across multiple AI providers, comparing their answers side by side, and generating a synthesized final answer.

The project is built as an Electron + React + TypeScript monorepo. It currently targets ChatGPT, Gemini, Kimi, and Doubao through provider adapters and browser automation, while keeping user sessions and task history on the local machine.

## Why This Exists

Large language models often disagree, omit details, or shine in different parts of the same problem. PolyAnswer Hub is designed to reduce tab switching and make multi-model comparison practical:

- ask once and run the prompt against several providers
- keep provider answers in one local task view
- compare agreement, disagreement, and missing details
- synthesize a cleaner final answer from the collected responses
- preserve local history for later review and export

## Current Status

This repository contains the first working scaffold and early implementation:

- Electron desktop shell
- React renderer shell
- TypeScript workspace packages
- provider metadata and adapter interfaces
- browser session manager backed by Playwright
- first real ChatGPT browser automation path
- provider skeletons for Gemini, Kimi, and Doubao
- task orchestration skeleton
- local database schema draft
- Markdown / TXT / PDF export helpers
- rule-based synthesis placeholder
- product, architecture, setup, and delivery docs

PolyAnswer Hub is not production-ready yet. The project is in MVP development, with the next major work focused on persistence, provider hardening, and full UI flows.

## Features

- **Multi-provider prompting**: submit the same prompt to selected AI providers.
- **User-assisted login**: use visible browser windows for manual login when needed.
- **Session persistence**: store provider browser profiles locally per provider.
- **Parallel execution model**: orchestrator is structured for concurrent provider runs.
- **Answer extraction**: provider adapters encapsulate provider-specific DOM logic.
- **Synthesis layer**: combines provider responses into a final answer.
- **Local history model**: database schema covers tasks, answers, sessions, synthesis, and events.
- **Export support**: Markdown, TXT, and PDF exporter modules are included.

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- npm workspaces
- Playwright
- SQLite / Drizzle schema design

## Workspace Layout

```text
.
├── apps/
│   └── desktop/          # Electron main process, preload, and React renderer
├── packages/
│   ├── browser-runner/   # Playwright browser/session helpers
│   ├── db/               # database schema and repositories
│   ├── export/           # Markdown, TXT, and PDF exporters
│   ├── logger/           # local logging helpers
│   ├── orchestrator/     # task coordination and provider workers
│   ├── providers/        # provider adapters for ChatGPT, Gemini, Kimi, Doubao
│   ├── shared/           # shared types, constants, and utilities
│   └── synthesizer/      # answer synthesis logic
├── docs/                 # product, architecture, setup, and delivery notes
├── package.json          # root workspace scripts
└── tsconfig.base.json    # shared TypeScript config
```

## Getting Started

### Requirements

- Windows
- Node.js 22 or newer recommended
- npm 10 or newer

### Install Dependencies

```bash
npm install
```

### Install Playwright Browser

Real browser automation needs Chromium:

```bash
npx playwright install chromium
```

### Run In Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Start Built App

```bash
npm run start
```

### Type Check

```bash
npm run typecheck
```

## Provider Notes

PolyAnswer Hub does not bypass provider login, CAPTCHA, or account checks. The intended flow is:

1. open a visible browser session for each provider
2. let the user log in manually
3. persist the local browser profile
4. reuse that session for later tasks
5. ask the provider through its normal web interface
6. extract the finished response for comparison and synthesis

Provider web UIs can change at any time, so selectors and completion detection logic should be treated as maintained integration code.

## Development Roadmap

- persist task results through the SQLite repository layer
- complete full React task, result, history, and login-center views
- harden ChatGPT automation with more real-world login and response cases
- implement real Gemini, Kimi, and Doubao adapters
- improve synthesis beyond the current rule-based placeholder
- add focused integration tests for provider adapters and orchestration
- package the desktop app for normal Windows installation

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture overview](docs/ARCHITECTURE.md)
- [Setup notes](docs/SETUP.md)
- [Provider strategy](docs/PROVIDERS.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Delivery plan](docs/DELIVERY_PLAN.md)
- [Roadmap](docs/ROADMAP.md)

## Security And Privacy

- Provider sessions are stored locally and should not be committed to Git.
- Browser snapshots, local data, logs, and generated build output are ignored by Git.
- Do not commit account cookies, local app settings, prompt history, or captured provider pages.

## License

No license has been selected yet.
