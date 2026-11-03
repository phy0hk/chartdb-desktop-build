# Active Manifest & Liveness Checklist

- Latest Chronicle Entry: `.ai_context/memory/CHRONICLE.md#2026-11-03 — Readable collaboration send-error toast`
- Requirements Version: 2.0 (`.ai_context/REQUIREMENTS.md`)
- Current Objective: Measure desktop build/startup performance and continue LAN collaboration reliability work, prioritizing remaining reproducible failures and evidence-gated follow-ups.
- Current Stage: Connection failure report received without a reproducible scenario. Frontend client opens a tokenized WebSocket; Go host binds `0.0.0.0` and advertises interface IPv4 candidates. No verified root cause from static inspection. Need host/guest runtime logs and exact invite URL/network context before a safe fix.
- Active Files: `AGENTS.md`, `.agents/skills/graphify/SKILL.md`.

## In-Progress Tasks

- [x] Updated `AGENTS.md` with Graphify-assisted code-reading guidance: use the knowledge graph as a navigation/cache aid, query scoped knowledge first, read relevant source directly whenever graph coverage is missing/unavailable/stale/insufficient, verify source and tests before changes, and refresh the graph after code changes when CLI is available.
- [x] Updated `.agents/skills/graphify/SKILL.md` to give the same fallback and source-verification rules, preserve the Graphify-self-correctness caution, and qualify graph refresh on CLI availability.
- [x] Fixed Prettier violations in generated Wails bindings and removed the unused `$Create` import; retained the generated JSDoc-only `$CancellablePromise` type import with a scoped lint suppression. Modified `frontend/bindings/chartdb-desktop/app.js`, `frontend/bindings/chartdb-desktop/index.js`, `frontend/bindings/chartdb-desktop/models.js`, `frontend/bindings/events/index.js`, and `frontend/bindings/github.com/wailsapp/wails/v3/internal/eventcreate.js`.
- [x] `NODE_OPTIONS="--max-old-space-size=4096" bun run build` passed from `frontend` (lint, TypeScript, and Vite build). Initial 120-second attempt timed out during bundling; rerun completed in 3m 28s. Vite emitted its existing large-chunk warning.
- [x] Diagnosed a revision baseline bug in `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx`: welcome carries a snapshot at its current revision, but the guest reset its applied revision to `0` and waited for missing revisions 1..R. Reconnect repeats this state transition.
- [x] Updated `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx` to initialize the applied revision from the welcome snapshot revision, so later operations are drained against the correct baseline.
- [x] Validation passed: collaboration Vitest tests (13 tests), `npx tsc -b --pretty false`, and ESLint for `toolbar.tsx`; editor diagnostics are clean.
- [ ] Manual two-desktop LAN verification is still required. If the prior error returns, capture the host/guest status and error payload details to diagnose that separately.
- [x] Added follow-up investigation tasks for the guest diagram-identity rejection and host `entityVersion:invalidinput` report in `tasks/todo.md` (Tasks 13–14); both require runtime evidence and tests/fixes only after root-cause confirmation.
- [ ] Obtain user host/guest reproduction details, operation payload/version map, active document IDs, and redacted rejection details; then execute Tasks 13–14. Manual LAN verification remains required.
- [ ] Continue performance and collaboration tasks in `tasks/todo.md` only when their prerequisites and policy decisions are available.

## Constraints

- Do not claim performance improvements without repeatable before/after measurements.
- Preserve tokenized WebSocket collaboration and authoritative host validation; do not describe collaboration as conflict-free.
- Keep collaboration desktop-only and report manual tests as blocked when no Wails desktop or second LAN client is available.
