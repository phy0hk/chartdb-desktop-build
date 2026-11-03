package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
)

const (
	maxSessionOperations = 10000
	maxTrackedEntities   = 100000
)

type operationDecision struct {
	Accepted  bool
	Duplicate bool
	Revision  uint64
	Code      string
	Message   string
	Operation collaborationMessage
}

type operationKey struct {
	clientID string
	id       string
}

type collaborationSequencer struct {
	revision      uint64
	entityVersion map[string]uint64
	seen          map[operationKey]collaborationMessage
	operationLog  []collaborationMessage
}

func newCollaborationSequencer() *collaborationSequencer {
	return &collaborationSequencer{
		entityVersion: make(map[string]uint64),
		seen:          make(map[operationKey]collaborationMessage),
		operationLog:  make([]collaborationMessage, 0),
	}
}

func newCollaborationSequencerFromSnapshot(snapshot json.RawMessage) (*collaborationSequencer, error) {
	entities, err := entityIDsInSnapshot(snapshot)
	if err != nil {
		return nil, err
	}
	if len(entities) > maxTrackedEntities {
		return nil, errors.New("snapshot_entity_capacity")
	}
	sequencer := newCollaborationSequencer()
	for entityID := range entities {
		sequencer.entityVersion[entityID] = 0
	}
	return sequencer, nil
}

func entityIDsInSnapshot(snapshot json.RawMessage) (map[string]struct{}, error) {
	var root any
	if len(snapshot) == 0 || len(snapshot) > maxSnapshotPayloadSize || !json.Valid(snapshot) {
		return nil, errors.New("invalid_snapshot")
	}
	if err := json.Unmarshal(snapshot, &root); err != nil {
		return nil, errors.New("invalid_snapshot")
	}
	entities := make(map[string]struct{})
	var visit func(any) error
	visit = func(value any) error {
		switch value := value.(type) {
		case map[string]any:
			if rawID, exists := value["id"]; exists {
				id, ok := rawID.(string)
				if !ok || id == "" || len(id) > maxProtocolIdentifierLength {
					return errors.New("invalid_snapshot_entity_id")
				}
				entities[id] = struct{}{}
				if len(entities) > maxTrackedEntities {
					return errors.New("snapshot_entity_capacity")
				}
			}
			for _, nested := range value {
				if err := visit(nested); err != nil {
					return err
				}
			}
		case []any:
			for _, nested := range value {
				if err := visit(nested); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := visit(root); err != nil {
		return nil, err
	}
	return entities, nil
}

func (s *collaborationSequencer) accept(operation collaborationMessage) operationDecision {
	key := operationKey{clientID: operation.ClientID, id: operation.ID}
	if previous, exists := s.seen[key]; exists {
		if sameOperation(previous, operation) {
			return operationDecision{
				Accepted:  true,
				Duplicate: true,
				Revision:  previous.Revision,
				Operation: previous,
			}
		}
		return operationDecision{Revision: s.revision, Code: "operation_id_reused", Message: "operation ID was reused with different content", Operation: operation}
	}

	if len(s.operationLog) >= maxSessionOperations {
		return operationDecision{Revision: s.revision, Code: "session_capacity", Message: "session operation history is full", Operation: operation}
	}
	newEntities := 0
	for entityID := range operation.EntityVersions {
		if _, known := s.entityVersion[entityID]; !known {
			newEntities++
		}
	}
	if len(s.entityVersion)+newEntities > maxTrackedEntities {
		return operationDecision{Revision: s.revision, Code: "session_capacity", Message: "session entity version capacity is full", Operation: operation}
	}
	for entityID, expectedVersion := range operation.EntityVersions {
		if currentVersion := s.entityVersion[entityID]; expectedVersion != currentVersion {
			return operationDecision{
				Revision:  s.revision,
				Code:      "conflict",
				Message:   fmt.Sprintf("entity %q changed since this operation was prepared", entityID),
				Operation: operation,
			}
		}
	}

	s.revision++
	operation.Revision = s.revision
	for entityID, version := range operation.EntityVersions {
		s.entityVersion[entityID] = version + 1
	}
	s.seen[key] = operation
	s.operationLog = append(s.operationLog, operation)
	return operationDecision{Accepted: true, Revision: s.revision, Operation: operation}
}

func (s *collaborationSequencer) currentRevision() uint64 {
	return s.revision
}

func (s *collaborationSequencer) replayAfter(revision uint64) ([]collaborationMessage, error) {
	if revision > s.revision {
		return nil, errors.New("revision_ahead")
	}
	var replay []collaborationMessage
	for _, operation := range s.operationLog {
		if operation.Revision > revision {
			replay = append(replay, operation)
		}
	}
	return replay, nil
}

func sameOperation(left, right collaborationMessage) bool {
	return left.Type == right.Type && left.ID == right.ID && left.ClientID == right.ClientID &&
		left.DocumentID == right.DocumentID && bytes.Equal(left.Payload, right.Payload) &&
		reflect.DeepEqual(left.EntityVersions, right.EntityVersions)
}

func (d operationDecision) acknowledgement() collaborationMessage {
	return collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "ack",
		ID:              d.Operation.ID,
		ClientID:        d.Operation.ClientID,
		DocumentID:      d.Operation.DocumentID,
		Revision:        d.Revision,
	}
}

func (d operationDecision) rejection() collaborationMessage {
	return collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "reject",
		ID:              d.Operation.ID,
		ClientID:        d.Operation.ClientID,
		DocumentID:      d.Operation.DocumentID,
		Revision:        d.Revision,
		Code:            d.Code,
		Message:         d.Message,
	}
}

func encodeCollaborationMessage(message collaborationMessage) ([]byte, error) {
	if err := validateCollaborationMessage(message); err != nil {
		return nil, err
	}
	data, err := json.Marshal(message)
	if err != nil {
		return nil, err
	}
	if len(data) > maxProtocolMessageSize {
		return nil, errors.New("message_size")
	}
	return data, nil
}
