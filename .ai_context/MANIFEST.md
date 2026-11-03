# Active Manifest & Liveness Checklist

- Latest Chronicle Entry: `.ai_context/memory/CHRONICLE.md#2026-11-03 — Readable collaboration send-error toast`
- Requirements Version: 2.0 (`.ai_context/REQUIREMENTS.md`)
- Current Objective: Measure desktop build/startup performance and continue LAN collaboration reliability work, prioritizing remaining reproducible failures and evidence-gated follow-ups.
- Current Stage: Error visibility improved for local diagram-send failures. Underlying operation validation failure and host/guest disconnect remain unconfirmed; the toast is diagnostic visibility, not a root-cause fix.
- Active Files: `tasks/todo.md`, `tasks/plan.md`, `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx`, `frontend/src/lib/collaboration/`.

## In-Progress Tasks

- [ ] Request the complete operation validation error/payload and reproduce the `entityVersions` rejection; use the new toast detail to capture it.
- [ ] Diagnose why both host and guest disconnect during join using exact logs and environment details; do not infer the toast fixed connectivity.
- [ ] Continue performance and collaboration tasks in `tasks/todo.md` only when their prerequisites and policy decisions are available.

## Constraints

- Do not claim performance improvements without repeatable before/after measurements.
- Preserve tokenized WebSocket collaboration and authoritative host validation; do not describe collaboration as conflict-free.
- Keep collaboration desktop-only and report manual tests as blocked when no Wails desktop or second LAN client is available.
