# Provider Implementation Notes

## Provider Contract

Each provider adapter must implement:

- login check
- open provider home
- open login page
- manual login wait
- prompt submit
- answer completion wait
- answer extraction

## Provider Order

1. ChatGPT
2. Claude
3. Gemini
4. Kimi
5. Doubao
6. Grok

## Shared Rules

- Keep provider-specific selectors in `selectors.ts`
- Keep extraction logic resilient and conservative
- Prefer visible automation for MVP
- Capture snapshot artifacts on failure

## Known Implementation Challenges

- ChatGPT: composer variants and rate-limit states
- Claude: account state, conversation resets, and response container variants
- Gemini: Google account state and dynamic response regions
- Kimi: dynamic editor structure
- Doubao: localized UI variations and fast DOM updates
- Grok: login routing and response selector variance
