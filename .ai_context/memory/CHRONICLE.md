# Project Chronicle

Historical implementation notes consolidated from the legacy timestamped memos. Entries are ordered chronologically.

## 2026-11-03 — Graphify code-reading skill mapping

### Task Summary & Timestamp

Added the codebase analysis and code-reading skill mapping to `AGENTS.md`. Timestamp: 2026-11-03 (exact time was not recorded).

### Files Modified

- `AGENTS.md`
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Key Technical Additions / Decisions

- Mapped codebase analysis or code reading to the `graphify` skill, with instruction to use the repository knowledge graph where applicable.

### Constraints/Anti-Patterns Discovered

- Kept the change limited to the requested skill mapping; no codebase analysis was needed.

## 2026-11-02 — LAN collaboration implementation

### Task Summary & Timestamp

Implemented initial LAN collaboration for ChartDB Desktop. Timestamp: 2026-11-02 (exact time was not recorded).

### Files Modified

- `.ai_context/REQUIREMENTS.md`
- `collaboration.go`
- `app.go`
- `main.go`
- `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx`
- `frontend/src/window.d.ts`

### Key Technical Additions / Decisions

- Added an ephemeral LAN HTTP/WebSocket host with a tokenized endpoint, snapshot relay, input size/JSON checks, peer cleanup, and Wails lifecycle methods.
- Added toolbar controls for starting/stopping and joining sessions, sharing URLs, status, and diagram snapshot synchronization.
- Host shutdown stops the collaboration session.

### Constraints/Anti-Patterns Discovered

- Snapshot synchronization is last-write-wins; it does not merge concurrent edits. Consider explicit merge/locking or CRDT semantics before relying on simultaneous multi-editor changes.
- Automated WebSocket integration tests were recommended. The join flow used a browser prompt; a copyable invite modal was suggested.
- Validation reported `go test app.go collaboration.go` and `git diff --check` passing. Frontend build could not run because dependencies were missing (`eslint: command not found`); full `go test ./...` was blocked by missing `frontend/dist` for the embed directive.

## 2026-11-03 — Collaborator cursors and participant identity

### Task Summary & Timestamp

Added collaborator cursors, stable participant IDs, editable display names, and alternate IPv4 invite URLs. Timestamp: 2026-11-03 (specific memo timestamps: 00:00 and 00:01).

### Files Modified

- `collaboration.go`
- `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx`
- `frontend/src/pages/editor-page/canvas/canvas.tsx`
- `frontend/src/window.d.ts`

### Key Technical Additions / Decisions

- Relayed cursor/name messages independently of the latest diagram snapshot.
- Generated participant IDs and random initial display names; supported renaming and presence/cursor messages.
- Published throttled cursor positions and rendered named peer cursors.
- Host invitations include all enumerated IPv4 addresses, each using the same port, token, and collaboration path; retained `url` compatibility alongside a `urls` list. The host uses the first URL and copies all invite URLs separated by newlines.

### Constraints/Anti-Patterns Discovered

- Add WebSocket integration tests and presence removal so disconnected collaborators disappear promptly.
- Frontend build was not run for the cursor/name work. Validation reported Go tests, frontend diagnostics, and `git diff --check` passing; the alternate URL memo reported `go test ./...` passing.

## 2026-11-03 — Restore collaboration cursor and synchronization

### Task Summary & Timestamp

Restored visible collaborator cursors and corrected diagram snapshot send tracking. Timestamp: 2026-11-03 (exact time was not recorded; memo identified 00:00).

### Files Modified

- `frontend/src/pages/editor-page/canvas/canvas.tsx`
- `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx`

### Key Technical Additions / Decisions

- Rendered collaborator cursors with fixed screen coordinates and a high stacking order, removing the prior canvas-bounds offset from React Flow screen positions.
- Tracked last-sent and last-received diagram snapshots separately, preventing duplicate sends while allowing new local states to broadcast as node positions change.

### Constraints/Anti-Patterns Discovered

- Test with two connected desktop clients while moving/resizing nodes. If an edit type remains delayed, consider transient operation-level messages rather than relying only on full snapshots.
- Focused diagnostics and `git diff --check` passed; frontend build was not run.

## 2026-11-03 — Collaboration cursor and live updates

### Task Summary & Timestamp

Refined cursor direction and coordinate handling, and synchronized the host's latest diagram state when the WebSocket opens. Timestamp: 2026-11-03 15:08.

### Files Modified

- `frontend/src/pages/editor-page/canvas/canvas.tsx`
- `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx`

### Key Technical Additions / Decisions

- Rotated collaborator cursor glyph to point top-left.
- Preserved shared cursor positions in React Flow diagram coordinates so each participant maps them through their own viewport; zoom differences do not change the shared diagram position.
- Host sends its latest diagram snapshot on WebSocket open, including changes made while connecting. Existing state broadcasts handle subsequent updates, and received snapshots are tracked to prevent echoes.

### Constraints/Anti-Patterns Discovered

- Recommended WebSocket host/join integration tests and collaborator disconnect/presence cleanup.
- Focused diagnostics and `git diff --check` passed.

## 2026-11-03 — Advanced collaboration design direction

### Task Summary & Timestamp

Continued planning for robust multi-user collaboration after the user rejected current last-write-wins behavior and approved advancing beyond it. Timestamp: 2026-11-03 (exact time not recorded).

### Approved Direction

- Plan for durable, typed operations sequenced and validated by one authoritative session host; do not use complete-snapshot last-write-wins as the durable edit model.
- Keep cursor, selection, active-edit indicators, and drag/resize previews transient and separate from committed diagram state, persistence, and undo history.
- Continue planning before application code changes. Requirements and guardrails must be revised only after concrete consistency guarantees, conflict rules, protocol, and security boundary are specified and reviewed.

### Verified Mutation-Boundary Findings

- `frontend/src/context/chartdb-context/chartdb-provider.tsx` owns diagram React state, local storage updates, and local undo actions across tables and nested field/index/constraint data, relationships, dependencies, areas, notes, custom types, and diagram metadata.
- `updateTablesState` is a broad batch/deletion path; `clearDiagramData`, `deleteDiagram`, `loadDiagramFromData`, and `updateDiagramData` replace/reset state outside ordinary entity mutation paths and need explicit collaborative semantics.
- Table removal can cascade into relationships and dependencies, so a compound action must be sequenced/applied atomically. Existing mutations often update local state/storage before adding undo history; this ordering cannot by itself serve as a host acknowledgement or durable collaboration guarantee.
- Current collaboration lifecycle remains in `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx` and checks `window.go?.main?.App` for Wails availability.

### Open Design Work

- Exact same-entity conflict policy, operation-journal durability/acknowledgement meaning, host loss and disconnect editing behavior, optimistic pending-operation policy, collaborative undo/redo, reconnect/resync, identity/document binding, limits, and versioned message schema remain unresolved.
- Trace UI mutation call sites and provider/runtime composition before finalizing the collaboration-aware domain boundary.
- No application code was changed during this planning work.

## 2026-11-03 — Collaboration transport backpressure foundation

### Task Summary & Timestamp

Started the first implementation stage after explicit user authorization. Hardened the existing Go WebSocket relay transport without changing its wire format yet, keeping the current frontend usable while the typed protocol/client migration is implemented in later stages. Timestamp: 2026-11-03 (exact time not recorded).

### Files Modified

- `collaboration.go`
- `collaboration_test.go`
- `.ai_context/REQUIREMENTS.md` (version 2.0)
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Implementation Details

- Added bounded per-peer outbound queues and one writer goroutine per WebSocket connection; broadcasts enqueue data rather than performing network writes under the hub mutex.
- Added write deadlines, ping/pong keepalive with read deadlines, server header timeout, and safe concurrent peer/session shutdown.
- Disconnects slow peers when their bounded outbound queue fills, avoiding unbounded memory growth and blocked broadcasts.
- Deduplicated enumerated local IPv4 invite addresses.
- Added focused tests for sender exclusion/broadcast, transient presence not replacing the latest cached diagram payload, and slow-peer removal.
- The transport remains temporarily wire-compatible with the existing snapshot frontend. It is not yet the typed protocol or operation-sequencing implementation; strict message validation and domain operation integration remain planned.

### Validation

- `gofmt -w collaboration.go collaboration_test.go`
- `go test app.go collaboration.go collaboration_test.go` passed.
- `go test -race app.go collaboration.go collaboration_test.go` passed.

## 2026-11-03 — Versioned collaboration message schema

### Task Summary & Timestamp

Defined a strict version-1 collaboration envelope and semantic validators as the next migration step toward operation-based synchronization. This is schema groundwork only; the current hub still accepts the legacy frontend wire format until the integration/migration task is complete. Timestamp: 2026-11-03 (exact time not recorded).

### Files Modified

- `collaboration_protocol.go`
- `collaboration_protocol_test.go`
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Implementation Details

- Added typed message shapes for hello, operation, snapshot bootstrap, cursor, name, selection, active editing, preview, ack/reject, leave, ping/pong, and structured errors.
- Added strict JSON decoding with unknown-field and trailing-data rejection, protocol-version checking, and semantic validation for required identifiers, entity version maps, payloads, coordinates, names, and selections.
- Defined explicit protocol message (8 MiB), operation/preview payload (256 KiB), entity-count (64), selection-count (256), name (64 bytes), and identifier bounds. Snapshot payload limit matches the 8 MiB transport cap, with envelope overhead still subject to the message cap.
- Kept this validator isolated so far; hub integration and sequence/ack/reject semantics remain the next tasks.

### Validation

- `go test -race app.go collaboration.go collaboration_test.go collaboration_protocol.go collaboration_protocol_test.go` passed.
- `git diff --check` passed.

## 2026-11-03 — Authoritative operation sequencer core

### Task Summary & Timestamp

Implemented the standalone host sequencer for operation revisions and entity-version conflict checks. Timestamp: 2026-11-03 (exact time not recorded).

### Files Modified

- `collaboration_operations.go`
- `collaboration_operations_test.go`
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Implementation Details

- Operations are ordered by one monotonically increasing session revision and atomically checked against expected versions for every touched entity before any version increments.
- Stale entity versions are rejected with `conflict`; disjoint entity updates can be accepted independently.
- Accepted operations are deduplicated by the `(clientId, operationId)` pair. Exact retries receive the original revision; reuse of an ID with different content is rejected.
- A bounded 10,000-operation replay log and 100,000-entity version table reject additional work explicitly with `session_capacity`, rather than silently discarding durable operations.
- Replay by revision is available for the future reconnect/synchronization flow.
- Added snapshot entity-ID traversal and version seeding so existing diagram entities begin at version 0; malformed IDs and entity-table capacity overflow are rejected before the session starts accepting operations.
- This is a standalone core, not yet wired to the WebSocket hub or frontend.

### Validation

- `go test -race app.go collaboration.go collaboration_test.go collaboration_protocol.go collaboration_protocol_test.go collaboration_operations.go collaboration_operations_test.go` passed.

## 2026-11-03 — Typed WebSocket session and sequencer integration

### Task Summary & Timestamp

Integrated the typed protocol and host sequencer into a new WebSocket session mode, retaining a separate legacy relay mode for migration compatibility. Timestamp: 2026-11-03 (exact time not recorded).

### Files Modified

- `collaboration.go`
- `collaboration_hub_protocol.go`
- `collaboration_hub_protocol_test.go`
- `collaboration_protocol.go`
- `collaboration_operations.go`
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Implementation Details

- Typed sessions require an initial host hello containing document identity and the host's authoritative initial diagram snapshot; participant joins must target that same document.
- A successful hello returns a welcome carrying the base snapshot. Participants then receive the in-memory operation log from revision 1 onward.
- Typed operation messages are checked against session document identity, sequenced, checked against entity versions, acknowledged/rejected, and broadcast to other peers. Exact operation retries are acknowledged without rebroadcast.
- Added a 16-participant cap, explicit session-ended state, host-disconnect session termination, participant leave notification, and blocking-with-timeout enqueue for replay so replay does not fail merely because a normal log exceeds one outbound queue's capacity.
- Legacy clients continue to use the prior snapshot relay, but typed and legacy clients cannot mix within a session. The current toolbar still uses legacy mode until frontend migration.
- At the time of initial hub integration, server operation payloads were opaque JSON. A subsequent schema-hardening stage now validates diagram changes; authorization policies and robust transient coalescing remain open work.

### Validation

- Added WebSocket integration tests for typed host/participant hello, operation acknowledgement/relay, stale-version rejection, and snapshot-plus-log replay.
- `go test -race app.go collaboration.go collaboration_test.go collaboration_protocol.go collaboration_protocol_test.go collaboration_operations.go collaboration_operations_test.go collaboration_hub_protocol.go collaboration_hub_protocol_test.go` passed.
- `git diff --check` passed.

## 2026-11-03 — Frontend typed collaboration protocol client

### Task Summary & Timestamp

Added the frontend's runtime-validated version-1 collaboration message schemas and WebSocket client foundation. Timestamp: 2026-11-03 (exact time not recorded).

### Files Modified

- `frontend/src/lib/collaboration/collaboration-protocol.ts`
- `frontend/src/lib/collaboration/collaboration-client.ts`
- `frontend/src/lib/collaboration/__tests__/collaboration-protocol.test.ts`
- `collaboration_protocol.go`
- `collaboration_hub_protocol.go`
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Implementation Details

- Added strict Zod validation for versioned messages, identifiers, entity version maps, selection counts, positions, and message-size bounds.
- Added a lifecycle-managed frontend WebSocket client with typed hello/welcome handling, subscription events, outgoing message validation, and leave on close.
- Participant hello may omit `documentId`; server binds it to the host's authoritative diagram in the welcome. Host hello must include a diagram ID and initial snapshot.
- Frontend client/protocol are not yet wired into the toolbar or ChartDB mutations. The legacy toolbar still uses the legacy relay, so these additions do not yet activate the operation protocol in the UI.

### Validation

- `npx vitest run src/lib/collaboration/__tests__/collaboration-protocol.test.ts` passed (4 tests).
- `npx tsc -b --pretty false` passed.
- Targeted Go race tests including typed WebSocket integration passed.

## 2026-11-03 — Server-side diagram operation validation

### Task Summary & Timestamp

Added authoritative validation of diagram-change operation payloads before sequencing. Timestamp: 2026-11-03 (exact time not recorded).

### Files Modified

- `collaboration_protocol.go`
- `collaboration_protocol_test.go`
- `collaboration_hub_protocol_test.go`
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Implementation Details

- Operation payloads now require nonempty bounded `changes` arrays of `upsert`, `delete`, or `metadata` changes.
- Only the supported diagram collections are accepted; upserts must carry a value with an ID matching the change ID; deletes cannot carry values; metadata must include name/database type.
- Change entity IDs must be unique, and the entity-version map must exactly match the touched entity IDs so clients cannot lock/check entities different from those being modified.
- Existing WebSocket operation tests were migrated to the typed change shape.

### Validation

- Added rejection coverage for mismatched IDs/version keys, unknown collections, and empty operations.
- `go test -race app.go collaboration.go collaboration_test.go collaboration_protocol.go collaboration_protocol_test.go collaboration_operations.go collaboration_operations_test.go collaboration_hub_protocol.go collaboration_hub_protocol_test.go` passed.

## 2026-11-03 — Diagram operation diff and reducer

### Task Summary & Timestamp

Added a pure frontend conversion between diagram state transitions and atomic entity-versioned operation payloads. Timestamp: 2026-11-03 (exact time not recorded).

### Files Modified

- `frontend/src/lib/collaboration/diagram-operations.ts`
- `frontend/src/lib/collaboration/__tests__/diagram-operations.test.ts`
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Implementation Details

- Diffs tables, relationships, dependencies, areas, custom types, and notes by stable entity ID; table fields/indexes/constraints travel with their parent table as one conflict unit.
- Groups all changes from one diagram transition into one operation and includes the currently-known version of every touched entity, including diagram metadata changes.
- Excludes diagram timestamps from the diff to avoid turning every persistence timestamp update into a collaboration operation.
- Adds a pure reducer for remote upserts/deletes/metadata that clones collection arrays and validates IDs. Table removal-related cascades can be represented together when the provider transition includes all affected arrays.
- The diff/reducer are tested utilities only; provider event capture, per-client version tracking, remote persistence/history policy, and toolbar integration remain unimplemented.

### Validation

- `npx vitest run src/lib/collaboration/__tests__` passed (8 tests).
- `npx tsc -b --pretty false` passed after correcting fixture typing.

## 2026-11-03 — Frontend operation validation and version seeding

### Task Summary & Timestamp

Extended the diagram-operation utility with runtime payload validation and snapshot version seeding. Timestamp: 2026-11-03 (exact time not recorded).

### Files Modified

- `frontend/src/lib/collaboration/diagram-operations.ts`
- `frontend/src/lib/collaboration/__tests__/diagram-operations.test.ts`
- `collaboration_protocol.go`
- `collaboration_protocol_test.go`
- `collaboration_hub_protocol_test.go`
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Implementation Details

- Frontend validates operation payload shape, known collections, unique changed entity IDs, upsert ID matching, metadata shape, and exact agreement between changed entities and entity-version keys.
- Frontend seeds all diagram entity IDs (including nested table fields/indexes/constraints) to version 0 from the welcome snapshot.
- Go server now enforces a bounded typed diagram-change payload, validates supported change kinds/collections, matches upsert IDs, rejects duplicate entities, and requires exact correspondence with the entity-version map.
- Updated typed WebSocket tests to use the new operation payload shape.

### Validation

- `npx vitest run src/lib/collaboration/__tests__` passed (9 tests).
- `npx tsc -b --pretty false` passed.
- `go test -race app.go collaboration.go collaboration_test.go collaboration_protocol.go collaboration_protocol_test.go collaboration_operations.go collaboration_operations_test.go collaboration_hub_protocol.go collaboration_hub_protocol_test.go` passed.

## 2026-11-03 — Collaboration synchronization read-only gate

### Task Summary

Prevented local edits while the typed participant is disconnected or recovering authoritative state. Welcome/resync now declares the host revision that replay must reach before the editor unlocks.

### Files Modified

- `frontend/src/context/chartdb-context/chartdb-provider.tsx`
- `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx`
- `collaboration_hub_protocol.go`
- `collaboration_operations.go`

### Implementation Details

- Added provider collaboration synchronization state and combined it with existing read-only/diff state.
- Toolbar closes the editor on connection, disconnection, errors, and resync; it re-enables editing after replay reaches the revision advertised in welcome. Explicit stop restores the prior editable state.
- Host welcome and resync welcome carry the sequencer's current revision, while the snapshot remains the base snapshot and accepted operations replay after it.

### Validation

- `go test -race ./...` passed.
- `npm test -- --run src/lib/collaboration` passed (9 tests).
- `npx tsc -b --pretty false`, targeted ESLint, and `git diff --check` passed.

## 2026-11-03 — Collaboration host fallback and operation validation

### Task Summary & Timestamp

Fixed a nullable metadata validation rejection and made host startup try every discovered invite address rather than failing on an unusable first interface. Timestamp: 2026-11-03.

### Files Modified

- `frontend/src/lib/collaboration/diagram-operations.ts`
- `frontend/src/lib/collaboration/__tests__/diagram-operations.test.ts`
- `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx`
- `collaboration.go`
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Implementation Details

- Metadata validation now accepts null `databaseEdition`, matching diagrams that carry an explicit empty edition.
- Private IPv4 addresses are preferred over other global-unicast IPv4 addresses; loopback, link-local, and non-global addresses are excluded. All discovered candidates remain shareable.
- Host connection attempts cycle through invite URLs and only expose the successful URL as the active connection; failed attempts stop the session if no address works.
- Existing Copy invite behavior already copies the complete newline-separated URL list; no duplicate copy mechanism was added.
- Optimization work was kept to an evidence-based roadmap: measure build phases/bundle and startup first, then optimize the measured hot path. No speculative build/runtime changes were made.

### Validation

- Focused collaboration Vitest: 10 tests passed, including null edition regression.
- `npx tsc -b` passed.
- `go test ./...` and `go test -race ./...` passed.
- ESLint targeted invocation and `git diff --check` passed.
- Manual two-device host/join and clipboard verification were not available in this environment.

## 2026-11-03 — Readable collaboration send-error toast

### Task Summary & Timestamp

Added a destructive toast for local collaboration diagram-send failures, formatting Zod validation issues into readable path/message lines. Timestamp: 2026-11-03.

### Files Modified

- `frontend/src/lib/collaboration/format-collaboration-error.ts`
- `frontend/src/lib/collaboration/__tests__/format-collaboration-error.test.ts`
- `frontend/src/pages/editor-page/canvas/toolbar/toolbar.tsx`
- `.ai_context/MANIFEST.md`
- `.ai_context/memory/CHRONICLE.md`

### Technical Additions

- Zod validation issues are shown as multiline `path: message` text in the existing destructive toast system; regular Error instances show their message.
- The toast content wraps long paths and preserves newlines. Existing toolbar collaboration status remains available.

### Anti-Patterns Avoided

- Did not claim that the toast fixes the underlying validation failure or the disconnected host/guest state; the supplied truncated report is insufficient to identify the root cause.
- Did not weaken operation validation or change collaboration sequencing.

### Validation

- Focused collaboration Vitest: 2 files, 7 tests passed.
- Targeted ESLint and `npx tsc -b` passed.
