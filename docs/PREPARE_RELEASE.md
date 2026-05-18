# Prepare A GitHub Release

Use this checklist before pushing DuoAsk to a public GitHub repository or cutting a release.

## 1. Verify The Worktree

```bash
git status --short
git diff --check
git ls-files -o --exclude-standard
```

Do not use `git add .` until the untracked file list has been reviewed.

Usually include:

- source files under `apps/` and `packages/`
- docs under `docs/`
- project metadata such as `README.md`, `LICENSE`, `package.json`, and `package-lock.json`
- GitHub files under `.github/`
- branding assets under `apps/desktop/electron/renderer/public/branding/`
- README screenshots under `docs/assets/`

Usually exclude:

- local browser profiles under `data/` or `apps/desktop/data/`
- provider snapshots
- `.playwright-mcp/`
- `.env` files
- temporary scripts such as `tmp-*` and root-level `test_*.mjs`
- logs and local debug output

## 2. Rotate Any Exposed Secrets

If any SMTP password, API token, cookie, browser profile, or account screenshot was ever present in the worktree, rotate it before publishing. Removing it from the latest commit is not enough if it may have been copied, logged, or pushed elsewhere.

## 3. Run Release Checks

```bash
npm run release:check
```

This runs lint, typecheck, build, and a full npm audit.

## 4. Review Product Claims

Before publishing, confirm the README matches current behavior:

- supported provider list
- Windows-only status
- local API endpoints
- manual-login limitation
- MVP-stage caveats
- no promise of CAPTCHA, login, usage-limit, or provider-term bypass

## 5. Suggested GitHub Settings

Repository description:

```text
Local-first desktop app for asking one question across multiple AI providers and comparing the answers.
```

Topics:

```text
electron, react, typescript, ai, llm, chatgpt, claude, gemini, grok, playwright, desktop-app, local-first
```

Recommended first release title:

```text
DuoAsk v0.1.0 MVP
```

Recommended release notes:

```text
Initial MVP release of DuoAsk, a local-first Windows desktop app for asking one prompt across multiple AI providers, comparing raw answers, saving local history, and generating a synthesized response.

Highlights:
- Electron + React + TypeScript desktop app
- Browser-based provider adapters for ChatGPT, Claude, Gemini, Kimi, Doubao, and Grok
- User-assisted login and local browser session reuse
- Local HTTP API on 127.0.0.1:3719
- Local history and text export
- MIT license

Known limitations:
- Provider automation is experimental and can break when provider web UIs change
- Windows is the current target platform
- Installer packaging is still planned
```

## 6. After Publishing

- Add screenshots to the GitHub repository social preview.
- Pin a short demo GIF or screenshot in the README.
- Open a few starter issues for good first contributions.
- Enable GitHub Security Advisories if available.
- Watch CI on the first public push.
