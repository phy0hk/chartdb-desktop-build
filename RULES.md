# Project Guardrails

## Governance

- Read this file first, then `.ai_context/MANIFEST.md` for active scope and liveness. Read requirements only when high-level specifications change, and the chronicle only when historical rationale is needed.
- Keep `.ai_context/MANIFEST.md` current as work progresses; record concrete findings and mark completed work immediately.
- Keep context artifacts separated by purpose: `REQUIREMENTS.md` defines current specifications, `MANIFEST.md` tracks active work, and `memory/CHRONICLE.md` records historical decisions.
- Create commits only when the user explicitly requests one. When requested, use concise, descriptive, imperative commit messages; keep commits local and do not push unless the user explicitly requests it.

## Project Architecture & Code Style

- Preserve the Wails desktop architecture, Go backend conventions, and frontend conventions; make focused changes that match the current implementation.
- Collaboration is supported in the Wails runtime and in browser mode when `VITE_COLLABORATION_URL` points at a Go service started with `CHARTDB_COLLABORATION_SERVER=1 go run .`. Normal web mode with no collaboration URL must remain unchanged.
- Update requirements when high-level architecture, core requirements, or conventions change.

## Security Boundaries

- For LAN collaboration, require the unguessable session token in the WebSocket endpoint and validate incoming message formats and sizes.
- Treat LAN collaboration as unencrypted and unsuitable for untrusted networks; make the shared address and token explicit to users.

## Anti-Patterns & Constraints

- Do not run `wails build` or production packaging unless the task requires a build artifact; these can consume enough resources to freeze the operating system. Running `go run`, `go test`, the Vite dev server, and headless browser test runners is explicitly allowed for development and verification.

- Do not describe collaboration as conflict-free. The legacy snapshot relay is last-arriving/last-write-wins. The approved operation model sequences edits at the host and rejects stale same-entity versions; it is conflict detection/serialization, not CRDT merging.
- Do not expose collaboration in normal web app usage when no collaboration service URL is configured; browser collaboration requires an explicit `VITE_COLLABORATION_URL`.
- Do not read unrelated project files or historical notes when the manifest does not call for them.
- Do not generate new timestamped legacy memos; add historical implementation notes to `.ai_context/memory/CHRONICLE.md`.
