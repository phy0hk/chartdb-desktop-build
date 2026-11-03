# ChartDB Desktop Collaboration Requirements

Version: 1.0

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
- Connected clients exchange complete diagram snapshots; receiving a snapshot replaces local diagram state.
- Connected participants can share cursor and display-name presence.
- Host shutdown and explicit stop close the session listener and clients.
- Collaboration is exposed only in the Wails desktop runtime; normal web app use remains unchanged.

## Security and constraints

- Bind the listener to all local interfaces on an ephemeral port so LAN peers can connect.
- Require an unguessable token in the WebSocket path and validate incoming messages and message sizes.
- LAN collaboration is not encrypted or suitable for untrusted networks; clearly show users the shared address and token.
- Initial synchronization uses last-arriving complete snapshot semantics. Concurrent simultaneous edits are last-write-wins, not CRDT or operation-level merging.

## Validation

- Go tests/build validate the host service.
- Frontend lint, typecheck, and build validate the toolbar integration.
