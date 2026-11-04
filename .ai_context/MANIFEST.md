# Active Manifest & Liveness Checklist

- Latest Chronicle Entry: `.ai_context/memory/CHRONICLE.md#2026-11-04 — Commit hygiene rule`
- Requirements Version: 2.0 (`.ai_context/REQUIREMENTS.md`)
- Current Objective: Continue ChartDB Desktop and LAN collaboration work only when required by an active task and with resource-aware validation.
- Current Stage: Repository commit hygiene guidance is complete. Existing worktree guidance changes are preserved; no application source changes were made.
- Active Files: None.

## In-Progress Tasks

- [x] Added the commit hygiene rule to `RULES.md`.
- [x] Recorded the guidance change in `.ai_context/memory/CHRONICLE.md`.
- [x] Validated the guidance diff with `git diff --check`.
- [x] Create a local commit without pushing.
- [x] Leave the manifest ready for the next explicitly requested desktop or collaboration task.

## Constraints

- Do not compile or package unnecessarily; builds can consume substantial CPU and memory.
- Do not claim performance improvements without repeatable before/after measurements.
- Preserve tokenized WebSocket collaboration and authoritative host validation; do not describe collaboration as conflict-free.
- Keep collaboration desktop-only and report manual tests as blocked when no Wails desktop or second LAN client is available.
