# Public Launch Plan

This checklist focuses on improving first impressions, trust, and contributor conversion after the repository becomes public.

## Before Making The Repository Public

- Rename or align the repository with the product name, ideally `duoask`, `duoask-desktop`, or `duoask-ai`.
- Confirm `npm run release:check` passes.
- Confirm the README screenshots and `docs/assets/duoask-demo.gif` show the current UI.
- Add `docs/assets/duoask-social-preview.png` as the GitHub social preview image.
- Create the first GitHub release notes from `docs/PREPARE_RELEASE.md`.
- Enable GitHub Security Advisories, Dependabot alerts, dependency graph, and secret scanning.

Suggested repository description:

```text
Local-first desktop app for asking one question across multiple AI providers and comparing the answers.
```

Suggested topics:

```text
electron, react, typescript, ai, llm, chatgpt, claude, gemini, grok, playwright, desktop-app, local-first
```

## First Release Assets

Best first release:

- Windows installer or portable zip generated with `npm run package:win:portable`
- short release notes
- one screenshot
- known limitations
- hash for downloaded artifacts if packaging is manual

If installer packaging is not ready, make that explicit and keep the source build instructions near the top of the README.

## High-Value Starter Issues

Create a few issues with `good first issue` or `help wanted` labels:

- Replace the README walkthrough GIF with a real provider-run recording when safe demo accounts are available.
- Add Windows installer packaging beyond the portable zip.
- Add provider smoke-test harness.
- Add unit tests for exporter and synthesizer packages.
- Improve provider status documentation.
- Add a mock provider mode for trying the UI without real provider accounts.
- Remove legacy `POLYANSWER_API_*` compatibility after a deprecation window.

## Launch Copy

Short English version:

```text
I built DuoAsk, a local-first Windows desktop app that sends one prompt to ChatGPT, Claude, Gemini, Kimi, Doubao, and Grok, compares the answers side by side, and synthesizes a final response. It uses visible browser login, stores sessions locally, and does not bypass provider verification.
```

Short Chinese version:

```text
我做了一个本地优先的 Windows 桌面应用 DuoAsk：一个问题同时问 ChatGPT、Claude、Gemini、Kimi、豆包和 Grok，并排比较回答，再综合生成最终答案。登录和验证都走可见浏览器流程，会话与历史保存在本机。
```

## After Launch

- Pin the repository on the GitHub profile.
- Watch CI on the first public push.
- Answer early issues quickly, even if only to ask for reproduction details.
- Keep known limitations honest and visible.
- Cut small releases frequently while provider adapters are moving fast.
