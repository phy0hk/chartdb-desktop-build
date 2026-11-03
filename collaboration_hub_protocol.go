package main

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/gorilla/websocket"
)

const maxCollaborationParticipants = 16

func hasProtocolVersion(data []byte) bool {
	var envelope map[string]json.RawMessage
	if json.Unmarshal(data, &envelope) != nil {
		return false
	}
	_, exists := envelope["protocolVersion"]
	return exists
}

func (h *collaborationHub) serveLegacy(peer *collaborationPeer, firstMessage []byte) {
	h.mu.Lock()
	if h.ended || (h.mode != "" && h.mode != "legacy") || len(h.clients) >= maxCollaborationParticipants {
		h.mu.Unlock()
		_ = peer.conn.Close()
		return
	}
	h.mode = "legacy"
	h.clients[peer] = struct{}{}
	if len(h.latest) > 0 {
		peer.outbound <- append([]byte(nil), h.latest...)
	}
	h.mu.Unlock()

	go peer.writePump()
	defer h.removePeer(peer)
	h.broadcast(peer, firstMessage)
	h.readLegacyMessages(peer)
}

func (h *collaborationHub) readLegacyMessages(peer *collaborationPeer) {
	for {
		kind, data, err := peer.conn.ReadMessage()
		if err != nil {
			return
		}
		if kind != websocket.TextMessage || len(data) > maxCollaborationMessage || !json.Valid(data) {
			return
		}
		h.broadcast(peer, data)
	}
}

func (h *collaborationHub) serveTyped(peer *collaborationPeer, firstMessage []byte) {
	message, err := decodeCollaborationMessage(firstMessage)
	if err != nil || message.Type != "hello" {
		if err == nil {
			err = errors.New("hello_required")
		}
		h.writeHandshakeError(peer.conn, err.Error())
		return
	}

	h.mu.Lock()
	if h.ended || (h.mode != "" && h.mode != "typed") || len(h.clients) >= maxCollaborationParticipants {
		h.mu.Unlock()
		h.writeHandshakeError(peer.conn, "session_unavailable")
		return
	}
	if h.mode == "" {
		if message.Role != "host" {
			h.mu.Unlock()
			h.writeHandshakeError(peer.conn, "host_not_ready")
			return
		}
		sequencer, err := newCollaborationSequencerFromSnapshot(message.Payload)
		if err != nil {
			h.mu.Unlock()
			h.writeHandshakeError(peer.conn, err.Error())
			return
		}
		h.mode = "typed"
		h.documentID = message.DocumentID
		h.hostClient = message.ClientID
		h.snapshot = append([]byte(nil), message.Payload...)
		h.sequencer = sequencer
	} else {
		if message.Role == "host" || message.ClientID == h.hostClient || (message.DocumentID != "" && message.DocumentID != h.documentID) {
			h.mu.Unlock()
			h.writeHandshakeError(peer.conn, "document_or_role_mismatch")
			return
		}
		if _, err := h.sequencer.replayAfter(0); err != nil {
			h.mu.Unlock()
			h.writeHandshakeError(peer.conn, "resync_unavailable")
			return
		}
	}
	for existing := range h.clients {
		if existing.clientID == message.ClientID {
			h.mu.Unlock()
			h.writeHandshakeError(peer.conn, "client_id_in_use")
			return
		}
	}
	peer.clientID = message.ClientID
	peer.role = message.Role
	h.clients[peer] = struct{}{}
	welcome := collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "welcome",
		DocumentID:      h.documentID,
		Revision:        h.sequencer.currentRevision(),
		Payload:         append(json.RawMessage(nil), h.snapshot...),
	}
	welcomeBytes, encodeErr := encodeCollaborationMessage(welcome)
	var replay []collaborationMessage
	if encodeErr == nil && message.Role == "participant" {
		replay, encodeErr = h.sequencer.replayAfter(0)
	}
	h.mu.Unlock()
	if encodeErr != nil {
		h.removePeer(peer)
		return
	}

	go peer.writePump()
	if !enqueueCollaborationMessage(peer, welcomeBytes) {
		h.removePeer(peer)
		return
	}
	for _, operation := range replay {
		data, err := encodeCollaborationMessage(operation)
		if err != nil || !enqueueCollaborationMessageWait(peer, data, writeWait) {
			h.removePeer(peer)
			return
		}
	}

	defer h.removePeer(peer)
	h.readTypedMessages(peer)
}

func (h *collaborationHub) readTypedMessages(peer *collaborationPeer) {
	for {
		kind, data, err := peer.conn.ReadMessage()
		if err != nil {
			return
		}
		if kind != websocket.TextMessage {
			return
		}
		message, err := decodeCollaborationMessage(data)
		if err != nil {
			h.sendProtocolError(peer, err.Error())
			return
		}
		if message.Type == "leave" {
			if message.ClientID != peer.clientID {
				return
			}
			return
		}
		h.handleTypedMessage(peer, message)
	}
}

func (h *collaborationHub) handleTypedMessage(peer *collaborationPeer, message collaborationMessage) {
	if message.ClientID != peer.clientID {
		h.sendProtocolError(peer, "client_id_mismatch")
		return
	}
	if message.Type == "ping" {
		message.Type = "pong"
		message.ClientID = ""
		if data, err := encodeCollaborationMessage(message); err == nil {
			enqueueCollaborationMessage(peer, data)
		}
		return
	}
	if message.Type == "operation" {
		h.handleTypedOperation(peer, message)
		return
	}
	if message.Type == "resync" {
		h.handleTypedResync(peer, message)
		return
	}
	if message.Type != "cursor" && message.Type != "name" && message.Type != "selection" && message.Type != "editing" && message.Type != "preview" {
		h.sendProtocolError(peer, "message_not_allowed")
		return
	}

	message.DocumentID = ""
	data, err := encodeCollaborationMessage(message)
	if err != nil {
		h.sendProtocolError(peer, err.Error())
		return
	}
	h.broadcastTyped(peer, data, message.Type == "cursor" || message.Type == "preview")
}

func (h *collaborationHub) handleTypedResync(peer *collaborationPeer, request collaborationMessage) {
	h.mu.Lock()
	if h.ended || request.DocumentID != h.documentID || h.sequencer == nil {
		h.mu.Unlock()
		h.sendProtocolError(peer, "resync_unavailable")
		return
	}
	snapshot := append([]byte(nil), h.snapshot...)
	replay, err := h.sequencer.replayAfter(0)
	documentID := h.documentID
	revision := h.sequencer.currentRevision()
	h.mu.Unlock()
	if err != nil {
		h.sendProtocolError(peer, "resync_unavailable")
		return
	}
	welcome, err := encodeCollaborationMessage(collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "welcome",
		DocumentID:      documentID,
		Revision:        revision,
		Payload:         snapshot,
	})
	if err != nil || !enqueueCollaborationMessageWait(peer, welcome, writeWait) {
		h.removePeer(peer)
		return
	}
	for _, operation := range replay {
		data, encodeErr := encodeCollaborationMessage(operation)
		if encodeErr != nil || !enqueueCollaborationMessageWait(peer, data, writeWait) {
			h.removePeer(peer)
			return
		}
	}
}

func (h *collaborationHub) handleTypedOperation(peer *collaborationPeer, operation collaborationMessage) {
	if operation.DocumentID != h.documentID {
		h.sendOperationDecision(peer, operationDecision{Code: "document_mismatch", Message: "operation targets a different diagram", Operation: operation})
		return
	}
	h.mu.Lock()
	if h.ended || h.sequencer == nil {
		h.mu.Unlock()
		h.sendOperationDecision(peer, operationDecision{Code: "session_ended", Message: "collaboration session is no longer active", Operation: operation})
		return
	}
	decision := h.sequencer.accept(operation)
	var broadcast []byte
	if decision.Accepted && !decision.Duplicate {
		broadcast, _ = encodeCollaborationMessage(decision.Operation)
	}
	peers := make([]*collaborationPeer, 0, len(h.clients))
	if decision.Accepted && broadcast != nil {
		for recipient := range h.clients {
			if recipient != peer {
				peers = append(peers, recipient)
			}
		}
	}
	h.mu.Unlock()

	if !decision.Accepted {
		h.sendOperationDecision(peer, decision)
		return
	}
	ack, err := encodeCollaborationMessage(decision.acknowledgement())
	if err != nil || !enqueueCollaborationMessage(peer, ack) {
		h.removePeer(peer)
		return
	}

	for _, recipient := range peers {
		if !enqueueCollaborationMessage(recipient, broadcast) {
			h.removePeer(recipient)
		}
	}
}

func (h *collaborationHub) sendOperationDecision(peer *collaborationPeer, decision operationDecision) {
	data, err := encodeCollaborationMessage(decision.rejection())
	if err != nil || !enqueueCollaborationMessage(peer, data) {
		h.removePeer(peer)
	}
}

func (h *collaborationHub) broadcastTyped(sender *collaborationPeer, data []byte, transient bool) {
	var slowPeers []*collaborationPeer
	h.mu.Lock()
	for peer := range h.clients {
		if peer == sender {
			continue
		}
		select {
		case peer.outbound <- append([]byte(nil), data...):
		default:
			if transient {
				continue
			}
			delete(h.clients, peer)
			slowPeers = append(slowPeers, peer)
		}
	}
	h.mu.Unlock()
	for _, peer := range slowPeers {
		peer.shutdown()
	}
}

func enqueueCollaborationMessage(peer *collaborationPeer, data []byte) bool {
	select {
	case <-peer.done:
		return false
	case peer.outbound <- append([]byte(nil), data...):
		return true
	default:
		return false
	}
}

func enqueueCollaborationMessageWait(peer *collaborationPeer, data []byte, timeout time.Duration) bool {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-peer.done:
		return false
	case peer.outbound <- append([]byte(nil), data...):
		return true
	case <-timer.C:
		return false
	}
}

func (h *collaborationHub) sendProtocolError(peer *collaborationPeer, code string) {
	message := collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "error",
		Code:            code,
		Message:         "collaboration message rejected",
	}
	data, err := encodeCollaborationMessage(message)
	if err != nil || !enqueueCollaborationMessage(peer, data) {
		h.removePeer(peer)
	}
}

func (h *collaborationHub) writeHandshakeError(conn *websocket.Conn, code string) {
	message := collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "error",
		Code:            code,
		Message:         "collaboration handshake rejected",
	}
	data, err := encodeCollaborationMessage(message)
	if err == nil {
		_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
		_ = conn.WriteMessage(websocket.TextMessage, data)
	}
	_ = conn.Close()
}
