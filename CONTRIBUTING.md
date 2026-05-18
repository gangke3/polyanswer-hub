# Contributing

Thanks for taking a look at DuoAsk.

## Local Setup

```bash
npm install
npm run typecheck
npm run build
```

Run the desktop app in development mode:

```bash
npm run dev
```

## Before Opening A Pull Request

- Keep provider-specific logic inside `packages/providers/src/<provider>/`.
- Do not commit browser profiles, snapshots, prompt history, cookies, tokens, or SMTP credentials.
- Run `npm run typecheck` and `npm run build`.
- If you change provider selectors, note which provider account state you tested.
- If you add user-facing behavior, update the README or docs where needed.

## Provider Adapter Notes

Provider web UIs change often. Prefer conservative selectors, visible browser flows, and clear failure messages. DuoAsk should never bypass login, CAPTCHA, manual verification, usage limits, or provider terms.
