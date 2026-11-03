package main

import (
	"encoding/json"
	"testing"
)

func operationForTest(id, client string, versions map[string]uint64, payload string) collaborationMessage {
	return collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "operation",
		ID:              id,
		ClientID:        client,
		DocumentID:      "diagram-1",
		EntityVersions:  versions,
		Payload:         json.RawMessage(payload),
	}
}

func TestSequencerSeedsEntityVersionsFromSnapshot(t *testing.T) {
	snapshot := json.RawMessage(`{"id":"diagram-1","tables":[{"id":"table-1","fields":[{"id":"field-1"}],"indexes":[{"id":"index-1"}]}],"relationships":[{"id":"relationship-1"}]}`)
	sequencer, err := newCollaborationSequencerFromSnapshot(snapshot)
	if err != nil {
		t.Fatalf("newCollaborationSequencerFromSnapshot() error = %v", err)
	}
	for _, id := range []string{"diagram-1", "table-1", "field-1", "index-1", "relationship-1"} {
		if version, exists := sequencer.entityVersion[id]; !exists || version != 0 {
			t.Errorf("entity %q version = %d, exists=%v; want version 0", id, version, exists)
		}
	}
}

func TestSequencerRejectsMalformedSnapshotEntityIDs(t *testing.T) {
	_, err := newCollaborationSequencerFromSnapshot(json.RawMessage(`{"tables":[{"id":42}]}`))
	if err == nil || err.Error() != "invalid_snapshot_entity_id" {
		t.Fatalf("error = %v, want invalid_snapshot_entity_id", err)
	}
}

func TestSequencerOrdersOperationsAndRejectsStaleEntityVersion(t *testing.T) {
	sequencer := newCollaborationSequencer()
	first := operationForTest("op-1", "peer-1", map[string]uint64{"table-1": 0}, `{"name":"users"}`)
	accepted := sequencer.accept(first)
	if !accepted.Accepted || accepted.Revision != 1 {
		t.Fatalf("first operation decision = %#v, want accepted revision 1", accepted)
	}

	independent := operationForTest("op-2", "peer-2", map[string]uint64{"table-2": 0}, `{"name":"roles"}`)
	accepted = sequencer.accept(independent)
	if !accepted.Accepted || accepted.Revision != 2 {
		t.Fatalf("independent operation decision = %#v, want accepted revision 2", accepted)
	}

	stale := operationForTest("op-3", "peer-2", map[string]uint64{"table-1": 0}, `{"name":"accounts"}`)
	rejected := sequencer.accept(stale)
	if rejected.Accepted || rejected.Code != "conflict" {
		t.Fatalf("stale operation decision = %#v, want conflict rejection", rejected)
	}
	if sequencer.revision != 2 {
		t.Fatalf("revision = %d, want 2 after rejection", sequencer.revision)
	}
	if sequencer.entityVersion["table-1"] != 1 {
		t.Fatalf("table-1 version = %d, want 1", sequencer.entityVersion["table-1"])
	}
}

func TestSequencerDeduplicatesAcceptedOperationAndRejectsIDReuse(t *testing.T) {
	sequencer := newCollaborationSequencer()
	operation := operationForTest("op-1", "peer-1", map[string]uint64{"table-1": 0}, `{"name":"users"}`)
	first := sequencer.accept(operation)
	duplicate := sequencer.accept(operation)
	if !duplicate.Accepted || duplicate.Revision != first.Revision || len(sequencer.operationLog) != 1 {
		t.Fatalf("duplicate decision = %#v, revision=%d log length=%d", duplicate, sequencer.revision, len(sequencer.operationLog))
	}

	reused := operationForTest("op-1", "peer-1", map[string]uint64{"table-1": 0}, `{"name":"accounts"}`)
	decision := sequencer.accept(reused)
	if decision.Accepted || decision.Code != "operation_id_reused" {
		t.Fatalf("reused ID decision = %#v, want operation_id_reused", decision)
	}
}

func TestSequencerChecksMultiEntityOperationAtomically(t *testing.T) {
	sequencer := newCollaborationSequencer()
	accepted := operationForTest("op-1", "peer-1", map[string]uint64{"table-1": 0}, `{"name":"users"}`)
	if decision := sequencer.accept(accepted); !decision.Accepted {
		t.Fatalf("accept first operation: %#v", decision)
	}

	multi := operationForTest("op-2", "peer-2", map[string]uint64{"table-2": 0, "table-1": 0}, `{"relationship":true}`)
	decision := sequencer.accept(multi)
	if decision.Accepted || decision.Code != "conflict" {
		t.Fatalf("multi-entity decision = %#v, want conflict", decision)
	}
	if _, exists := sequencer.entityVersion["table-2"]; exists {
		t.Fatal("valid entity in rejected multi-entity operation must remain unchanged")
	}
}

func TestSequencerReplaysOperationsAfterRevision(t *testing.T) {
	sequencer := newCollaborationSequencer()
	for _, operation := range []collaborationMessage{
		operationForTest("op-1", "peer-1", map[string]uint64{"table-1": 0}, `{"value":1}`),
		operationForTest("op-2", "peer-1", map[string]uint64{"table-1": 1}, `{"value":2}`),
	} {
		if decision := sequencer.accept(operation); !decision.Accepted {
			t.Fatalf("accept operation: %#v", decision)
		}
	}
	replay, err := sequencer.replayAfter(1)
	if err != nil || len(replay) != 1 || replay[0].Revision != 2 {
		t.Fatalf("replayAfter(1) = %#v, %v; want revision 2", replay, err)
	}
	if _, err := sequencer.replayAfter(3); err == nil {
		t.Fatal("replay from a future revision should fail")
	}
}
