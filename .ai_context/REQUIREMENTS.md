# ChartDB Desktop Collaboration Requirements

Version: v1.0

## Objective
Enable users on the same local network to collaborate on one ChartDB diagram through the existing Wails desktop app.

## Functional requirements
- The session host can start and stop a collaboration session for the open diagram.
- The host shares a LAN WebSocket URL and a randomly generated session token with participants.
- A participant can connect using the URL and token without a ChartDB account or cloud service.
- Connected clients exchange complete diagram snapshots; receiving a snapshot replaces local diagram state.
- Host shutdown and explicit stop close the session listener and clients.
- Collaboration is exposed only in the Wails desktop runtime; normal web app usage remains unchanged.

## Security and constraints
- Bind the listener to all local interfaces on an ephemeral port so LAN peers can connect.
- Require an unguessable token in the WebSocket path and validate incoming messages/size.
- LAN collaboration is not encrypted or suitable for untrusted networks; show users the shared address and token explicitly.
- Initial synchronization uses last-arriving complete snapshot semantics; concurrent simultaneous edits are last-write-wins, not CRDT/operation-level merging.

## Validation
- Go tests/build validate the host service.
- Frontend lint/typecheck/build validate the toolbar integration.
