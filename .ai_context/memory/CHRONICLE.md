# Project Chronicle

Historical implementation notes consolidated from the legacy timestamped memos. Entries are ordered chronologically.

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
