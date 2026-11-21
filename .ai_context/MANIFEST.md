# Active Manifest & Liveness Checklist

- Latest Chronicle Entry: `.ai_context/memory/CHRONICLE.md#2026-11-21 — Restore LAN collaboration end to end`
- Requirements Version: 2.2 (`.ai_context/REQUIREMENTS.md`)
- Current Objective: Ready for the next focused task. LAN collaboration reproduction, root-cause fixes, and three-client browser verification are complete; the remaining manual checks need a Wails runtime and a second physical LAN device.
- Scope note: this manifest tracks active work only. Historical diagnosis, root causes, and decisions are in the chronicle entry above.

## Completed in this iteration

- [x] Reconciled docs and requirements for Wails + browser service mode; bumped requirements to v2.2.
- [x] Refreshed Graphify and used separate Go/frontend queries; cross-language handoffs were verified in source and tests (the graph has no direct Go↔frontend edge).
- [x] Added real-listener Go WebSocket integration coverage for replay, reconnect replacement, atomic operations, conflict attribution, legacy rejection, virtual adapters, transient relay fields, and late-join presence.
- [x] Fixed frontend protocol/client alignment, reconnect/backoff, diagnostics, toolbar lifecycle, provider persistence/history seam, operation size limits, canvas awareness, and conflict UX.
- [x] Fixed the relay defect where `omitempty` dropped empty `selection`/`targetId` fields and the presence defect where late joiners never learned existing names.
- [x] Updated README with collaboration verification commands and session-end behavior.

## Verification log

| Check | Command / scenario | Result | Date |
| --- | --- | --- | --- |
| Go tests | `go test -race ./...` | Pass (all integration tests) | 2026-11-21 |
| Frontend unit tests | `npx vitest run src/lib/collaboration/__tests__ --reporter=dot` | Pass: 4 files / 30 tests | 2026-11-21 |
| Frontend typecheck | `npx tsc -b --pretty false` | Pass | 2026-11-21 |
| Frontend lint | `npm run lint` | Pass | 2026-11-21 |
| E2E | `npx playwright test e2e/collaboration.spec.ts` | Pass: 3 isolated Firefox clients; join/presence, live edit sync, cursor/selection awareness, host rejection/rollback, reconnect/resync, typed session end | 2026-11-21 |
| Diff hygiene | `git diff --check` | Pass | 2026-11-21 |
| Graphify | `graphify update .` | Pass: 4049 nodes / 11154 edges; semantic labels not refreshed (no API key) | 2026-11-22 |

## Known limits / next tasks

- [ ] Manual validation in the real Wails desktop runtime was not available; report it as not run.
- [ ] Validation from a second physical LAN device was not available; report it as not run.
- [ ] Browser mode uses one supervised Go service per session. After the host ends a session, a new service/URL is required.
- [ ] Graphify semantic labels were not refreshed because no LLM API key is configured; structural graph is current.

## Constraints

- REQUIREMENTS v2.2 is the source of truth.
- Host is authoritative; stale same-entity operations are rejected. This is conflict detection/serialization, not CRDT or conflict-free editing.
- Keep tokenized WebSocket paths, strict validation/size limits, and in-memory session history.
- Do not run `wails build` or production packaging without an explicit artifact request.
- Do not create a commit unless asked.
