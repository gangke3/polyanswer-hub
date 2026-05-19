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
- README screenshots under `docs/assets/` generated with mock data

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

To create a Windows portable release asset:

```bash
npm run package:win:portable
```

This writes a zip and SHA-256 checksum under `release/`. Review the generated files before attaching them to a GitHub Release.

If Electron's binary download is slow or missing, install the runtime first and then rerun packaging:

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules\electron\install.js
npm run package:win:portable
```

## 4. Review Product Claims

Before publishing, confirm the README matches current behavior:

- supported provider list
- Windows-only status
- local API endpoints
- README screenshots and language-switch behavior
- manual-login limitation
- MVP-stage caveats
- no promise of CAPTCHA, login, usage-limit, or provider-term bypass
- no real prompts, account names, cookies, local history, or provider answers in screenshots

## 5. Suggested GitHub Settings

Repository description:

```text
Local-first desktop app for asking one question across multiple AI providers and comparing the answers.
```

Topics:

```text
electron, react, typescript, ai, llm, chatgpt, claude, gemini, grok, playwright, desktop-app, local-first
```

Recommended multilingual release title:

```text
DuoAsk v0.2.0 Multilingual UI
```

Recommended release notes:

```text
DuoAsk v0.2.0 adds a bilingual 中文 / English interface and refreshes the public README with clean mock-data screenshots.

Highlights:
- 中文 / English interface switch in the main toolbar
- Local language preference stored on the user's machine
- Localized sidebar, task status, result tabs, history, logs, and settings copy
- README refreshed with bilingual setup instructions
- New README screenshots generated from mock data with no real prompts, accounts, cookies, or chat history
- Windows portable zip release asset

Known limitations:
- Provider automation is experimental and can break when provider web UIs change
- Windows is the current target platform
- Installer packaging is still planned; releases currently use a portable zip
```

## 6. After Publishing

- Add screenshots to the GitHub repository social preview.
- Use `docs/assets/duoask-social-preview.png` as the first social preview image.
- Keep README screenshots current and regenerate them with mock data before major UI releases.
- Open a few starter issues for good first contributions.
- Enable GitHub Security Advisories if available.
- Watch CI on the first public push.
