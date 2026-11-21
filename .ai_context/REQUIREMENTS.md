# ChartDB Desktop Collaboration Requirements

Version: 2.2

## Architecture and technology

- ChartDB is delivered as a Wails desktop application with a frontend and Go backend.
- LAN collaboration uses a Go-hosted HTTP/WebSocket service exposed through Wails lifecycle methods.
- Collaboration is local-network peer sharing; it does not require a ChartDB account or cloud service.

## Objective

Enable users on the same local network to collaborate on one ChartDB diagram through the existing Wails desktop app.

## Core requirements

- The session host can start and stop a collaboration session for the open diagram.
- The host shares LAN WebSocket invite URLs and a randomly generated session token with participants.
- Participants can connect using an invite URL and token without an account or cloud service.
- Durable diagram changes use typed operations rather than whole-diagram last-write-wins snapshots.
- One authoritative host validates and sequences accepted operations; sequence numbers are monotonic within a session.
- Operations include unique IDs and entity-version preconditions. Stale conflicting operations are rejected rather than silently overwriting newer edits. Multi-entity operations must be validated and applied atomically.
- Acknowledgement means accepted and sequenced in the current live session; the initial design does not promise survival of host shutdown/restart. Host shutdown ends the session, and clients must resynchronize from the host's current diagram after reconnecting to a new session.
- Transient cursor, selection, active-edit, and drag/resize preview state is not persisted and does not enter undo history.
- Connected participants can share cursor and display-name presence. A late joiner receives the current names of existing peers; renames propagate to all connected clients.
- Clients retry unexpected socket loss with bounded exponential backoff and resynchronize from the authoritative snapshot on reconnect. Handshake rejections and typed session-end events are surfaced with actionable status text; no retry occurs after explicit close or session end.
- Host shutdown and explicit stop close the session listener and clients. Participants receive a typed `session_ended` notice before shutdown.
- The UI exposes connection diagnostics (state, status, URL, revision, peer list, last message) and shows host rejections with last-writer detail, an optimistic rollback, and a resync request.
- Transient frames preserve semantically required empty fields (empty selection and stopped-editing signal) so strict clients do not disconnect.
- Collaboration is available in the Wails desktop runtime and in browser mode when `VITE_COLLABORATION_URL` points to a reachable Go collaboration service/session. Browser mode must not require Wails bindings; normal web app use remains unchanged when no collaboration service is configured.

## Security and constraints

- Bind the listener to all local interfaces on an ephemeral port so LAN peers can connect.
- Require an unguessable token in the WebSocket path and validate incoming messages and message sizes.
- LAN collaboration is not encrypted or suitable for untrusted networks; clearly show users the shared address and token.
- The host is authoritative for operation ordering and conflict preconditions. Same-entity edits based on stale entity versions are rejected with a conflict response; different-entity edits may proceed independently. This is serialized conflict detection, not CRDT merging or conflict-free editing.
- Initial join/resynchronization may use a complete authoritative snapshot associated with a session revision; snapshots are recovery/bootstrap data, not the durable edit protocol.
- Session operation history is initially in-memory only. A host restart ends the previous session; no acknowledged-operation recovery across restart is promised.
- Collaboration remains LAN-hosted, unencrypted, and unsuitable for untrusted networks. Browser hosting requires a separately reachable Go collaboration service because a browser cannot bind an inbound LAN listener.

## Validation

- Go tests/build validate the host service, including real-listener WebSocket integration tests for replay, reconnect replacement, atomic operations, conflict attribution, transient relay fields, and late-join presence.
- Frontend lint, typecheck, unit tests, and a Playwright harness with isolated browser contexts validate the toolbar and canvas integration end to end against the standalone Go service.
