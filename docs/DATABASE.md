# Database Design

## Storage Choice

SQLite is the MVP database because it is local-first, easy to ship with a desktop app, and sufficient for single-user usage.

## Main Tables

### tasks

Stores one user question execution.

### task_providers

Stores per-provider runtime status for a task.

### answers

Stores extracted answer text and optional raw artifacts.

### syntheses

Stores one synthesized result per task.

### provider_sessions

Stores persistent session metadata for ChatGPT, Claude, Gemini, Kimi, Doubao, and Grok.

### task_events

Stores state transitions and diagnostics.

## Design Notes

- `selected_providers_json` keeps the initial provider list immutable for history replay
- `task_events` helps debug fragile provider automation
- raw artifact paths are stored instead of blobs to keep the database small
