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

func (h *collaborationHub) serveTyped(peer *collaborationPeer, firstMessage []byte) {
	message, err := decodeCollaborationMessage(firstMessage)
	if err != nil || message.Type != "hello" {
		if err == nil {
			err = errors.New("hello_required")
		}
		h.writeHandshakeError(peer.conn, err.Error())
		return
	}

	var stalePeers []*collaborationPeer
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
		if existing.clientID != message.ClientID {
			continue
		}
		// Host identity cannot be replaced mid-session; a participant may
		// replace its own stale socket after a reconnect race.
		if existing.role == "host" || message.Role == "host" {
			h.mu.Unlock()
			h.writeHandshakeError(peer.conn, "client_id_in_use")
			return
		}
		delete(h.clients, existing)
		existing.replaced = true
		stalePeers = append(stalePeers, existing)
	}
	peer.clientID = message.ClientID
	peer.role = message.Role
	peer.name = message.Name
	h.clients[peer] = struct{}{}
	// A late joiner must learn who is already in the session; otherwise its
	// presence list only contains itself until everyone else sends again.
	var presence []collaborationMessage
	if message.Role == "participant" {
		for existing := range h.clients {
			if existing == peer || existing.name == "" {
				continue
			}
			presence = append(presence, collaborationMessage{
				ProtocolVersion: collaborationProtocolVersion,
				Type:            "name",
				ClientID:        existing.clientID,
				Name:            existing.name,
			})
		}
	}
	welcome := collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "welcome",
		DocumentID:      h.documentID,
		// Revision describes the base snapshot; replayed operations advance the
		// client from here to TargetRevision.
		Revision:       0,
		TargetRevision: h.sequencer.currentRevision(),
		Payload:        append(json.RawMessage(nil), h.snapshot...),
	}
	welcomeBytes, encodeErr := encodeCollaborationMessage(welcome)
	var replay []collaborationMessage
	if encodeErr == nil && message.Role == "participant" {
		replay, encodeErr = h.sequencer.replayAfter(0)
	}
	h.mu.Unlock()
	for _, stale := range stalePeers {
		stale.shutdown()
	}
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
	for _, existing := range presence {
		data, err := encodeCollaborationMessage(existing)
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

// encodeTransientMessage preserves fields that are semantically required even
// when empty. A generic encode with omitempty would drop an empty selection or
// the explicit empty targetId that means "stopped editing", producing frames
// the strict browser schema rejects and disconnecting every listener.
func encodeTransientMessage(message collaborationMessage) ([]byte, error) {
	switch message.Type {
	case "selection":
		selection := message.Selection
		if selection == nil {
			selection = []string{}
		}
		return json.Marshal(struct {
			ProtocolVersion int      `json:"protocolVersion"`
			Type            string   `json:"type"`
			ClientID        string   `json:"clientId"`
			Selection       []string `json:"selection"`
		}{message.ProtocolVersion, message.Type, message.ClientID, selection})
	case "editing":
		return json.Marshal(struct {
			ProtocolVersion int    `json:"protocolVersion"`
			Type            string `json:"type"`
			ClientID        string `json:"clientId"`
			TargetID        string `json:"targetId"`
		}{message.ProtocolVersion, message.Type, message.ClientID, message.TargetID})
	default:
		return encodeCollaborationMessage(message)
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

	if message.Type == "name" {
		h.mu.Lock()
		peer.name = message.Name
		h.mu.Unlock()
	}
	message.DocumentID = ""
	data, err := encodeTransientMessage(message)
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
		Revision:        0,
		TargetRevision:  revision,
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
