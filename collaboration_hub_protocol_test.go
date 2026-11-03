package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func dialCollaborationTestPeer(t *testing.T, url string, hello collaborationMessage) (*websocket.Conn, collaborationMessage) {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	if err := conn.SetReadDeadline(time.Now().Add(3 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	if err := conn.WriteJSON(hello); err != nil {
		t.Fatalf("send hello: %v", err)
	}
	var welcome collaborationMessage
	if err := conn.ReadJSON(&welcome); err != nil {
		t.Fatalf("read welcome: %v", err)
	}
	return conn, welcome
}

func TestTypedHubSequencesOperationsAndRejectsStaleVersions(t *testing.T) {
	hub := &collaborationHub{clients: make(map[*collaborationPeer]struct{})}
	server := httptest.NewServer(http.HandlerFunc(hub.serve))
	defer server.Close()
	url := "ws" + strings.TrimPrefix(server.URL, "http")
	snapshot := []byte(`{"id":"diagram-1","tables":[{"id":"table-1","name":"users"}]}`)

	host, hostWelcome := dialCollaborationTestPeer(t, url, collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "hello",
		ClientID:        "host-1",
		DocumentID:      "diagram-1",
		Role:            "host",
		Payload:         snapshot,
	})
	defer host.Close()
	if hostWelcome.Type != "welcome" || string(hostWelcome.Payload) != string(snapshot) {
		t.Fatalf("host welcome = %#v", hostWelcome)
	}

	participant, participantWelcome := dialCollaborationTestPeer(t, url, collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "hello",
		ClientID:        "peer-1",
		DocumentID:      "diagram-1",
		Role:            "participant",
	})
	defer participant.Close()
	if participantWelcome.Type != "welcome" || participantWelcome.Revision != 0 {
		t.Fatalf("participant welcome = %#v", participantWelcome)
	}

	operation := operationForTest("op-1", "host-1", map[string]uint64{"table-1": 0}, `{"changes":[{"kind":"upsert","collection":"tables","id":"table-1","value":{"id":"table-1","name":"people"}}]}`)
	if err := host.WriteJSON(operation); err != nil {
		t.Fatalf("send operation: %v", err)
	}
	var ack collaborationMessage
	if err := host.ReadJSON(&ack); err != nil {
		t.Fatalf("read ack: %v", err)
	}
	if ack.Type != "ack" || ack.Revision != 1 || ack.ID != operation.ID {
		t.Fatalf("ack = %#v", ack)
	}
	var relayed collaborationMessage
	if err := participant.ReadJSON(&relayed); err != nil {
		t.Fatalf("read relayed operation: %v", err)
	}
	if relayed.Type != "operation" || relayed.Revision != 1 {
		t.Fatalf("relayed operation = %#v", relayed)
	}

	stale := operationForTest("op-2", "peer-1", map[string]uint64{"table-1": 0}, `{"changes":[{"kind":"upsert","collection":"tables","id":"table-1","value":{"id":"table-1","name":"accounts"}}]}`)
	if err := participant.WriteJSON(stale); err != nil {
		t.Fatalf("send stale operation: %v", err)
	}
	var reject collaborationMessage
	if err := participant.ReadJSON(&reject); err != nil {
		t.Fatalf("read reject: %v", err)
	}
	if reject.Type != "reject" || reject.Code != "conflict" || reject.ID != stale.ID {
		t.Fatalf("reject = %#v", reject)
	}
}

func TestTypedHubReplaysAcceptedOperationsAfterSnapshot(t *testing.T) {
	hub := &collaborationHub{clients: make(map[*collaborationPeer]struct{})}
	server := httptest.NewServer(http.HandlerFunc(hub.serve))
	defer server.Close()
	url := "ws" + strings.TrimPrefix(server.URL, "http")
	snapshot := []byte(`{"id":"diagram-1","tables":[{"id":"table-1"}]}`)
	host, _ := dialCollaborationTestPeer(t, url, collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "hello",
		ClientID:        "host-1",
		DocumentID:      "diagram-1",
		Role:            "host",
		Payload:         snapshot,
	})
	defer host.Close()

	operation := operationForTest("op-1", "host-1", map[string]uint64{"table-1": 0}, `{"changes":[{"kind":"upsert","collection":"tables","id":"table-1","value":{"id":"table-1","name":"renamed"}}]}`)
	if err := host.WriteJSON(operation); err != nil {
		t.Fatalf("send operation: %v", err)
	}
	var ack collaborationMessage
	if err := host.ReadJSON(&ack); err != nil || ack.Type != "ack" {
		t.Fatalf("read ack = %#v, %v", ack, err)
	}

	reconnecting, welcome := dialCollaborationTestPeer(t, url, collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "hello",
		ClientID:        "peer-2",
		DocumentID:      "diagram-1",
		Role:            "participant",
	})
	defer reconnecting.Close()
	if welcome.Type != "welcome" || string(welcome.Payload) != string(snapshot) {
		t.Fatalf("resync welcome = %#v", welcome)
	}
	var replayed collaborationMessage
	if err := reconnecting.ReadJSON(&replayed); err != nil {
		t.Fatalf("read replayed operation: %v", err)
	}
	if replayed.Type != "operation" || replayed.ID != operation.ID || replayed.Revision != 1 {
		t.Fatalf("replayed operation = %#v", replayed)
	}
	if err := reconnecting.WriteJSON(collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "resync",
		ClientID:        "peer-2",
		DocumentID:      "diagram-1",
		Revision:        1,
	}); err != nil {
		t.Fatalf("request resync: %v", err)
	}
	var resetSnapshot collaborationMessage
	if err := reconnecting.ReadJSON(&resetSnapshot); err != nil || resetSnapshot.Type != "welcome" {
		t.Fatalf("read resync welcome = %#v, %v", resetSnapshot, err)
	}
	var resetReplay collaborationMessage
	if err := reconnecting.ReadJSON(&resetReplay); err != nil || resetReplay.Type != "operation" {
		t.Fatalf("read resync operation = %#v, %v", resetReplay, err)
	}
}
