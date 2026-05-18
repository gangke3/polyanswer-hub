# Product Requirements Document

## Product Name

多问 DuoAsk

## Product Goal

Let a user ask one question and collect answers from ChatGPT, Claude, Gemini, Kimi, Doubao, and Grok in one place, then produce a synthesized final answer.

## Product Positioning

- Platform: Windows desktop app
- Mode: local-first and user-assisted
- Value: reduce tab switching, compare AI outputs, improve answer completeness

## Target Users

- Heavy AI users
- Researchers
- Developers
- Content creators
- Knowledge workers

## MVP Providers

- ChatGPT
- Claude
- Gemini
- Kimi
- Doubao
- Grok

## Core User Flow

1. User opens the app
2. User selects providers
3. User enters a question
4. System checks login status for each provider
5. If needed, user logs in manually in a visible browser
6. System submits the prompt in parallel
7. System waits for each answer to finish
8. System extracts and stores all answers
9. UI shows all answers and a synthesized answer

## Core Features

### Prompt Input

- Multi-line input
- Provider multi-select
- Timeout setting
- Auto-synthesis toggle

### Login Center

- Provider login status
- Open login page
- Revalidate session
- Persisted session profile per provider

### Task Execution

- Parallel execution
- Per-provider status
- Cancel task
- Retry failed provider

### Result Display

- Side-by-side provider answers
- Synthesis panel
- Consensus and conflict sections
- Copy and export actions

### History

- Saved tasks
- Search and reopen
- Re-run past prompts

## Non-Goals

- Cloud-hosted account delegation
- Unattended CAPTCHA bypass
- Mobile apps for MVP
- Team collaboration for MVP

## Risks

- Provider DOM changes
- Login/session expiry
- Bot detection
- Streaming completion detection
- Terms-of-service review needs

## Success Criteria

- 6 providers supported
- Manual login works
- Parallel asking works
- Answers are visible in one UI
- Synthesis is produced
- History is saved locally
