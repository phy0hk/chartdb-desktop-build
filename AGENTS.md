# ChartDB Desktop Development Rules

These instructions apply to this repository, a Wails desktop application with a frontend and Go backend for ChartDB diagram collaboration.

## Read order and scope

1. Read `RULES.md` for non-negotiable project constraints.
2. Read `.ai_context/MANIFEST.md` for the active task, files in scope, and liveness checklist.
3. Read `.ai_context/REQUIREMENTS.md` only when changing architecture, requirements, interfaces, or core conventions.
4. Read `.ai_context/memory/CHRONICLE.md` only when historical rationale is needed.
5. Read only source files, tests, and documentation relevant to the active task. Do not scan unrelated areas of the repository.

Keep `.ai_context/MANIFEST.md` current: record the diagnosis before editing, mark each file complete immediately after editing it, and leave a clear list of remaining work.

## Project context

- The application is built with Wails, Go, and a frontend under `frontend/`.
- LAN collaboration is hosted by the Go backend and exposed through the Wails desktop runtime, or through a standalone Go service for browser mode when `VITE_COLLABORATION_URL` is set.
- Collaboration is local-network, unencrypted, and does not use a ChartDB account or cloud service.
- The host is authoritative for operation ordering and conflict detection. This is not CRDT or conflict-free editing.
- Normal web-app usage with no collaboration URL must remain unchanged; browser collaboration is opt-in via `VITE_COLLABORATION_URL`.

## Graphify

Treat `graphify-out/` as a navigation cache, not as a substitute for source code or tests. For repository-analysis tasks, use this order:

1. Check freshness by comparing the report's built commit with `git rev-parse HEAD`; if the working tree has code changes or the cache is stale, run `graphify update .` when the CLI is available.
2. Start with a scoped `graphify query`, `graphify explain`, or `graphify path` query to identify relevant files and relationships; use `GRAPH_REPORT.md` only for broad orientation.
3. Inspect the identified source files and tests directly before editing or validating. Record the useful query/result and any graph limitation in `.ai_context/MANIFEST.md` when the task uses Graphify.

For cross-language flows, do not infer a missing relationship from a missing graph edge. Query each language boundary separately, then verify the handoff in source and tests. If Graphify is unavailable, stale, or insufficient, continue with targeted source inspection and note that fallback. Never treat Graphify output as proof that the application is correct.

If code files are modified and the Graphify CLI is available, run `graphify update .` after the edits and record the refresh in the manifest.

## Implementation and validation

- Make the smallest complete change that satisfies the request.
- Preserve existing project conventions and avoid unrelated cleanup.
- Use tests for behavior changes and run the narrowest relevant checks first.
- Prefer focused Go tests, frontend typechecks, lint, or targeted tests over a full build when they provide sufficient validation.
- Do not run `wails build` or production packaging unless the task requires a build artifact. `go run`, `go test`, the Vite dev server, and headless browser test runners are explicitly allowed for development and verification.
- Do not claim performance improvements without repeatable before/after measurements.
- Report manual validation as blocked when a Wails desktop runtime or second LAN client is unavailable.

## Security and collaboration constraints

- Require the unguessable session token in WebSocket invite paths.
- Validate incoming message formats and sizes at the collaboration boundary.
- Make the shared address and token explicit to users; LAN collaboration is unsuitable for untrusted networks.
- Keep session history and acknowledged-operation guarantees consistent with the requirements: the initial design is in-memory and a host restart ends the session.
- Do not describe last-arriving snapshots or host sequencing as conflict-free collaboration.

## Context maintenance

- Record historical implementation decisions in `.ai_context/memory/CHRONICLE.md`.
- Update `.ai_context/REQUIREMENTS.md` and its version when requirements or architecture change.
- Do not create new timestamped files under deprecated `.ai_context/memos/`.
- When a task is complete, leave the manifest ready for the next focused task without deleting useful historical rationale.

## Skill use

Use the project-local skill that matches the request. In particular:

- `token-context-optimizer` for every request, before task-specific work.
- `spec-driven-development` and `planning-and-task-breakdown` for unclear or substantial new work.
- `incremental-implementation` for changes spanning multiple files or slices.
- `test-driven-development` for behavior changes and bug fixes.
- `debugging-and-error-recovery` for failures or unexpected behavior.
- `frontend-ui-engineering` for frontend interface work.
- `api-and-interface-design` for public or cross-module contracts.
- `code-review-and-quality` before merging or when reviewing a diff.
- `graphify` when using the repository knowledge graph.
