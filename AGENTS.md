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
- LAN collaboration is hosted by the Go backend and exposed through the Wails desktop runtime.
- Collaboration is local-network, unencrypted, and does not use a ChartDB account or cloud service.
- The host is authoritative for operation ordering and conflict detection. This is not CRDT or conflict-free editing.
- Normal web-app usage must remain unchanged unless the requirements explicitly change.

## Graphify

Treat `graphify-out/` as a navigation cache, not as a substitute for source code or tests. Use scoped Graphify queries when the cache is available and useful, then inspect the relevant source directly before editing or validating.

If code files are modified and the Graphify CLI is available, run `graphify update .` to refresh the cache. Do not treat Graphify output as proof that the application is correct.

## Implementation and validation

- Make the smallest complete change that satisfies the request.
- Preserve existing project conventions and avoid unrelated cleanup.
- Use tests for behavior changes and run the narrowest relevant checks first.
- Prefer focused Go tests, frontend typechecks, lint, or targeted tests over a full build when they provide sufficient validation.
- Do not compile or package unless the task requires a build artifact or build-specific validation; builds can consume substantial CPU and memory.
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
