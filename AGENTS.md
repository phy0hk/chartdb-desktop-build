# AI Developer & Technical Writer Rules — Budget Request System

Follow this context read order to minimize unnecessary context and maintain reliable progress:

## Read protocol (in order)

1. Read `/RULES.md` first for non-negotiable project guardrails.
2. Read `.ai_context/MANIFEST.md` second for immediate scope and real-time liveness tracking.
3. Read `.ai_context/REQUIREMENTS.md` only when the task changes high-level specifications, architecture, or core conventions.
4. Read `.ai_context/memory/CHRONICLE.md` only when historical architectural rationale is needed.
5. Read only the project or documentation files relevant to the active scope. Use the manifest's Files to Touch list when it is populated; do not scan unrelated files.

## Incremental manifest updates

- After diagnosis, update `.ai_context/MANIFEST.md` with concrete findings and a step-by-step checklist under In-Progress Tasks.
- As work proceeds, update the manifest immediately after completing each listed file or task, recording exact paths and remaining work.
- When resuming, check the manifest for partially completed checklists before repeating work.

## Documentation authoring

- Treat existing files under `documentation/` as authoritative narrative, while ensuring updates match the actual implementation.
- Keep section-number and database-table cross-references synchronized.
- When documenting API endpoints, include request/response DTO shapes, permission scopes, error codes, and caching behavior.

## Context maintenance

- Record historical implementation decisions in `.ai_context/memory/CHRONICLE.md`; do not create new timestamped files in the deprecated `.ai_context/memos/` directory.
- Update `.ai_context/REQUIREMENTS.md` when requirements or core architecture/conventions change, including its version.
- Keep the manifest focused on the active sprint. When a task is complete, regenerate it for the next sprint according to the context architecture; do not erase useful historical rationale from the chronicle.
