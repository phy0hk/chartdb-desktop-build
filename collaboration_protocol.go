package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"strings"
)

const (
	collaborationProtocolVersion = 1
	maxProtocolMessageSize       = 8 << 20
	maxSnapshotPayloadSize       = 8 << 20
	maxOperationPayloadSize      = 256 << 10
	maxEntityVersions            = 64
	maxSelectionTargets          = 256
	maxProtocolIdentifierLength  = 128
	maxParticipantNameLength     = 64
)

type collaborationPosition struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type collaborationMessage struct {
	ProtocolVersion int                    `json:"protocolVersion"`
	Type            string                 `json:"type"`
	ID              string                 `json:"id,omitempty"`
	ClientID        string                 `json:"clientId,omitempty"`
	DocumentID      string                 `json:"documentId,omitempty"`
	Role            string                 `json:"role,omitempty"`
	Revision        uint64                 `json:"revision,omitempty"`
	EntityVersions  map[string]uint64      `json:"entityVersions,omitempty"`
	Payload         json.RawMessage        `json:"payload,omitempty"`
	Name            string                 `json:"name,omitempty"`
	Position        *collaborationPosition `json:"position,omitempty"`
	Selection       []string               `json:"selection,omitempty"`
	TargetID        string                 `json:"targetId,omitempty"`
	Code            string                 `json:"code,omitempty"`
	Message         string                 `json:"message,omitempty"`
}

func decodeCollaborationMessage(data []byte) (collaborationMessage, error) {
	var message collaborationMessage
	if len(data) == 0 || len(data) > maxProtocolMessageSize {
		return message, errors.New("message_size")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&message); err != nil {
		return collaborationMessage{}, errors.New("invalid_message")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return collaborationMessage{}, errors.New("invalid_message")
	}
	if message.ProtocolVersion != collaborationProtocolVersion {
		return collaborationMessage{}, errors.New("unsupported_version")
	}
	if err := validateCollaborationMessage(message); err != nil {
		return collaborationMessage{}, err
	}
	return message, nil
}

func validateCollaborationMessage(message collaborationMessage) error {
	validID := func(value string) bool {
		return value != "" && len(value) <= maxProtocolIdentifierLength && strings.TrimSpace(value) == value
	}
	validPayload := func(payload json.RawMessage, limit int) bool {
		return len(payload) > 0 && len(payload) <= limit && json.Valid(payload) && !bytes.Equal(bytes.TrimSpace(payload), []byte("null"))
	}

	switch message.Type {
	case "hello":
		if !validID(message.ClientID) || (message.Role != "host" && message.Role != "participant") {
			return errors.New("invalid_hello")
		}
		if message.Role == "host" && !validID(message.DocumentID) {
			return errors.New("invalid_hello")
		}
		if message.Role == "participant" && message.DocumentID != "" && !validID(message.DocumentID) {
			return errors.New("invalid_hello")
		}
		if len(message.Name) > maxParticipantNameLength {
			return errors.New("invalid_name")
		}
		if message.Role == "host" && !validPayload(message.Payload, maxSnapshotPayloadSize) {
			return errors.New("invalid_hello_snapshot")
		}
		if message.Role == "participant" && len(message.Payload) > 0 {
			return errors.New("invalid_hello")
		}
	case "welcome":
		if !validID(message.DocumentID) || !validPayload(message.Payload, maxSnapshotPayloadSize) {
			return errors.New("invalid_welcome")
		}
	case "operation":
		if !validID(message.ID) || !validID(message.ClientID) || !validID(message.DocumentID) {
			return errors.New("invalid_operation")
		}
		if len(message.EntityVersions) == 0 || len(message.EntityVersions) > maxEntityVersions {
			return errors.New("invalid_entity_versions")
		}
		for entityID := range message.EntityVersions {
			if !validID(entityID) {
				return errors.New("invalid_entity_versions")
			}
		}
		if !validPayload(message.Payload, maxOperationPayloadSize) {
			return errors.New("invalid_operation_payload")
		}
		if err := validateDiagramOperationPayload(message); err != nil {
			return err
		}
	case "snapshot":
		if !validID(message.DocumentID) || !validPayload(message.Payload, maxSnapshotPayloadSize) {
			return errors.New("invalid_snapshot")
		}
	case "cursor":
		if !validID(message.ClientID) || message.Position == nil || !finitePosition(message.Position) {
			return errors.New("invalid_cursor")
		}
	case "name":
		if !validID(message.ClientID) || len(message.Name) == 0 || len(message.Name) > maxParticipantNameLength {
			return errors.New("invalid_name")
		}
	case "selection":
		if !validID(message.ClientID) || len(message.Selection) > maxSelectionTargets {
			return errors.New("invalid_selection")
		}
		for _, targetID := range message.Selection {
			if !validID(targetID) {
				return errors.New("invalid_selection")
			}
		}
	case "editing", "preview":
		if !validID(message.ClientID) || !validID(message.TargetID) {
			return fmt.Errorf("invalid_%s", message.Type)
		}
		if message.Type == "preview" && !validPayload(message.Payload, maxOperationPayloadSize) {
			return errors.New("invalid_preview")
		}
	case "ack":
		if !validID(message.ID) || message.Revision == 0 {
			return errors.New("invalid_ack")
		}
	case "reject":
		if !validID(message.ID) || !validID(message.Code) || len(message.Message) > 512 {
			return errors.New("invalid_reject")
		}
	case "leave":
		if !validID(message.ClientID) {
			return errors.New("invalid_leave")
		}
	case "resync":
		if !validID(message.ClientID) || !validID(message.DocumentID) {
			return errors.New("invalid_resync")
		}
	case "ping", "pong":
		return nil
	case "error":
		if !validID(message.Code) || len(message.Message) > 512 {
			return errors.New("invalid_error")
		}
	default:
		return errors.New("unknown_message_type")
	}
	return nil
}

type diagramOperationPayload struct {
	Changes []diagramEntityChange `json:"changes"`
}

type diagramEntityChange struct {
	Kind       string          `json:"kind"`
	Collection string          `json:"collection,omitempty"`
	ID         string          `json:"id"`
	Value      json.RawMessage `json:"value,omitempty"`
}

func validateDiagramOperationPayload(message collaborationMessage) error {
	decoder := json.NewDecoder(bytes.NewReader(message.Payload))
	decoder.DisallowUnknownFields()
	var payload diagramOperationPayload
	if err := decoder.Decode(&payload); err != nil || len(payload.Changes) == 0 || len(payload.Changes) > maxEntityVersions {
		return errors.New("invalid_operation_payload")
	}
	entityIDs := make(map[string]struct{}, len(payload.Changes))
	validCollections := map[string]bool{
		"tables": true, "relationships": true, "dependencies": true,
		"areas": true, "customTypes": true, "notes": true,
	}
	for _, change := range payload.Changes {
		if change.ID == "" || len(change.ID) > maxProtocolIdentifierLength {
			return errors.New("invalid_operation_change")
		}
		if _, duplicate := entityIDs[change.ID]; duplicate {
			return errors.New("duplicate_operation_entity")
		}
		entityIDs[change.ID] = struct{}{}
		switch change.Kind {
		case "delete":
			if !validCollections[change.Collection] || len(change.Value) > 0 {
				return errors.New("invalid_operation_change")
			}
		case "upsert":
			if !validCollections[change.Collection] || len(change.Value) == 0 || !json.Valid(change.Value) {
				return errors.New("invalid_operation_change")
			}
			var entity struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(change.Value, &entity); err != nil || entity.ID != change.ID {
				return errors.New("invalid_operation_entity")
			}
		case "metadata":
			if change.Collection != "" || len(change.Value) == 0 || !json.Valid(change.Value) {
				return errors.New("invalid_operation_change")
			}
			var metadata map[string]json.RawMessage
			if err := json.Unmarshal(change.Value, &metadata); err != nil || len(metadata["name"]) == 0 || len(metadata["databaseType"]) == 0 {
				return errors.New("invalid_operation_metadata")
			}
		default:
			return errors.New("invalid_operation_change")
		}
	}
	if len(entityIDs) != len(message.EntityVersions) {
		return errors.New("entity_version_mismatch")
	}
	for entityID := range entityIDs {
		if _, exists := message.EntityVersions[entityID]; !exists {
			return errors.New("entity_version_mismatch")
		}
	}
	return nil
}

func finitePosition(position *collaborationPosition) bool {
	const maxCoordinate = 1e7
	return position != nil && !math.IsNaN(position.X) && !math.IsInf(position.X, 0) &&
		!math.IsNaN(position.Y) && !math.IsInf(position.Y, 0) &&
		math.Abs(position.X) <= maxCoordinate && math.Abs(position.Y) <= maxCoordinate
}
