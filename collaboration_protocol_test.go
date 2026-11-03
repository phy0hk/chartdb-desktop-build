package main

import (
	"fmt"
	"strings"
	"testing"
)

func TestDecodeCollaborationMessage(t *testing.T) {
	data := []byte(`{"protocolVersion":1,"type":"operation","id":"op-1","clientId":"peer-1","documentId":"diagram-1","entityVersions":{"table-1":0},"payload":{"changes":[{"kind":"upsert","collection":"tables","id":"table-1","value":{"id":"table-1","name":"users"}}]}}`)
	message, err := decodeCollaborationMessage(data)
	if err != nil {
		t.Fatalf("decodeCollaborationMessage() error = %v", err)
	}
	if message.Type != "operation" || message.EntityVersions["table-1"] != 0 {
		t.Fatalf("unexpected decoded message: %#v", message)
	}
}

func TestDecodeCollaborationMessageRejectsInvalidDiagramOperations(t *testing.T) {
	base := `{"protocolVersion":1,"type":"operation","id":"op","clientId":"peer","documentId":"diagram","entityVersions":{"table":0},"payload":%s}`
	for name, payload := range map[string]string{
		"wrong entity version key": `{"changes":[{"kind":"delete","collection":"tables","id":"other"}]}`,
		"mismatched entity id":     `{"changes":[{"kind":"upsert","collection":"tables","id":"table","value":{"id":"other"}}]}`,
		"unknown collection":       `{"changes":[{"kind":"delete","collection":"users","id":"table"}]}`,
		"empty changes":            `{"changes":[]}`,
	} {
		t.Run(name, func(t *testing.T) {
			data := []byte(fmt.Sprintf(base, payload))
			if _, err := decodeCollaborationMessage(data); err == nil {
				t.Fatal("expected operation payload validation error")
			}
		})
	}
}

func TestDecodeCollaborationMessageRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name string
		data string
		want string
	}{
		{"unsupported version", `{"protocolVersion":2,"type":"ping"}`, "unsupported_version"},
		{"unknown field", `{"protocolVersion":1,"type":"ping","extra":true}`, "invalid_message"},
		{"trailing json", `{"protocolVersion":1,"type":"ping"}{}`, "invalid_message"},
		{"unknown type", `{"protocolVersion":1,"type":"invented"}`, "unknown_message_type"},
		{"missing operation id", `{"protocolVersion":1,"type":"operation","clientId":"peer","documentId":"diagram","entityVersions":{"table":0},"payload":{"x":1}}`, "invalid_operation"},
		{"missing entity version", `{"protocolVersion":1,"type":"operation","id":"op","clientId":"peer","documentId":"diagram","entityVersions":{},"payload":{"x":1}}`, "invalid_entity_versions"},
		{"oversized operation payload", `{"protocolVersion":1,"type":"operation","id":"op","clientId":"peer","documentId":"diagram","entityVersions":{"table":0},"payload":"` + strings.Repeat("x", maxOperationPayloadSize) + `"}`, "invalid_operation_payload"},
		{"non-finite cursor", `{"protocolVersion":1,"type":"cursor","clientId":"peer","position":{"x":1e100,"y":0}}`, "invalid_cursor"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := decodeCollaborationMessage([]byte(test.data))
			if err == nil || err.Error() != test.want {
				t.Fatalf("decodeCollaborationMessage() error = %v, want %q", err, test.want)
			}
		})
	}
}
