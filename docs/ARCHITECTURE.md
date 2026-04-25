# Architecture Overview

## High-Level Design

The app is split into a local desktop shell, a task orchestration layer, browser automation, provider adapters, persistence, and a synthesis engine.

## Major Layers

### Desktop App

- Electron main process for native windowing and IPC
- React renderer for UX

### Orchestrator

- Receives task requests
- Spawns provider runs
- Tracks state transitions
- Aggregates provider results
- Triggers synthesis

### Browser Runner

- Wraps Playwright browser/context/page management
- Persists session state by provider
- Exposes helper waiters and capture utilities

### Provider Adapters

- Encapsulate provider-specific DOM logic
- Handle login check, prompt submit, completion wait, answer extraction

### Persistence

- SQLite + Drizzle
- Stores tasks, answers, synthesis, sessions, and events

### Synthesis

- Rule-based synthesis for MVP
- Optional future LLM-based synthesis

## Runtime Flow

1. Renderer sends `task:create`
2. Main process calls orchestrator
3. Orchestrator loads provider registry
4. Each provider gets a browser context
5. Provider checks login and runs prompt
6. Results are stored and emitted as events
7. Synthesizer creates final answer
8. Renderer updates task/result views

## Provider Strategy

Each provider lives in its own directory and implements a shared interface. Shared helpers stay outside provider folders so provider code stays thin and replaceable.

## Session Strategy

- Dedicated profile directory per provider
- Visible browser window for manual login
- Validation on each task run
- Recovery path when login expires

