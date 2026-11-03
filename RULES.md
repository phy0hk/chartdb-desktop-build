# Project Guardrails

## Governance
- Treat the existing `documentation/` narrative as authoritative, but keep it consistent with the actual implementation.
- Keep documentation cross-references (including section numbers and database tables) synchronized.
- For API documentation, include request/response DTO shapes, permission scopes, error codes, and caching behavior.
- Read this file first, then `.ai_context/MANIFEST.md` for active scope and liveness. Read requirements only when high-level specifications change, and the chronicle only when historical rationale is needed.
- Keep `.ai_context/MANIFEST.md` current as work progresses; record concrete findings and mark completed work immediately.

## Architecture & Code Style
- Preserve the documented system architecture and existing project conventions; make focused changes that match the current implementation.
- Update requirements when high-level architecture, core requirements, or conventions change.
- Keep context artifacts separated by purpose: `REQUIREMENTS.md` defines current specifications, `MANIFEST.md` tracks active work, and `memory/CHRONICLE.md` records historical decisions.

## Security Boundaries
- For LAN collaboration, require the unguessable session token in the WebSocket endpoint and validate incoming message formats and sizes.
- Treat LAN collaboration as unencrypted and unsuitable for untrusted networks; make the shared address and token explicit to users.

## Anti-Patterns & Constraints
- Do not treat simultaneous collaboration edits as conflict-free: snapshot synchronization is last-arriving/last-write-wins, not CRDT or operation-level merging.
- Do not expose collaboration in normal web app usage unless requirements are deliberately changed; the current requirement scopes it to the Wails desktop runtime.
- Do not read unrelated project files or historical notes when the manifest does not call for them.
- Do not generate new timestamped legacy memos; add historical implementation notes to `.ai_context/memory/CHRONICLE.md`.
