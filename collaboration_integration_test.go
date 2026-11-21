package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func integrationDial(t *testing.T, url string, hello collaborationMessage) (*websocket.Conn, collaborationMessage) {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial %s: %v", url, err)
	}
	if err := conn.SetReadDeadline(time.Now().Add(3 * time.Second)); err != nil {
		t.Fatalf("read deadline: %v", err)
	}
	if err := conn.WriteJSON(hello); err != nil {
		t.Fatalf("hello: %v", err)
	}
	var first collaborationMessage
	if err := conn.ReadJSON(&first); err != nil {
		t.Fatalf("first message: %v", err)
	}
	return conn, first
}

func integrationHostHello() collaborationMessage {
	return collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "hello",
		ClientID:        "host-1",
		DocumentID:      "diagram-1",
		Role:            "host",
		Payload:         json.RawMessage(`{"id":"diagram-1","tables":[{"id":"table-1","name":"users"}]}`),
	}
}

func integrationParticipantHello(clientID string) collaborationMessage {
	return collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "hello",
		ClientID:        clientID,
		Role:            "participant",
	}
}

func TestIntegrationHostJoinAndOperationSync(t *testing.T) {
	session, err := startCollaboration()
	if err != nil {
		t.Fatalf("start collaboration: %v", err)
	}
	defer session.stop()

	host, welcome := integrationDial(t, session.URL, integrationHostHello())
	defer host.Close()
	if welcome.Type != "welcome" {
		t.Fatalf("host welcome type = %q, detail = %+v", welcome.Type, welcome)
	}

	participant, participantWelcome := integrationDial(t, session.URL, integrationParticipantHello("peer-1"))
	defer participant.Close()
	if participantWelcome.Type != "welcome" {
		t.Fatalf("participant welcome = %+v", participantWelcome)
	}

	operation := operationForTest("op-1", "host-1", map[string]uint64{"table-1": 0},
		`{"changes":[{"kind":"upsert","collection":"tables","id":"table-1","value":{"id":"table-1","name":"people"}}]}`)
	if err := host.WriteJSON(operation); err != nil {
		t.Fatalf("send operation: %v", err)
	}
	var ack collaborationMessage
	if err := host.ReadJSON(&ack); err != nil || ack.Type != "ack" || ack.Revision != 1 {
		t.Fatalf("ack = %+v, err = %v", ack, err)
	}
	var relayed collaborationMessage
	if err := participant.ReadJSON(&relayed); err != nil || relayed.Type != "operation" || relayed.Revision != 1 {
		t.Fatalf("relayed operation = %+v, err = %v", relayed, err)
	}

	stale := operationForTest("op-2", "peer-1", map[string]uint64{"table-1": 0},
		`{"changes":[{"kind":"upsert","collection":"tables","id":"table-1","value":{"id":"table-1","name":"accounts"}}]}`)
	if err := participant.WriteJSON(stale); err != nil {
		t.Fatalf("send stale operation: %v", err)
	}
	var reject collaborationMessage
	if err := participant.ReadJSON(&reject); err != nil || reject.Code != "conflict" {
		t.Fatalf("conflict reject = %+v, err = %v", reject, err)
	}
	// A conflict must identify both the entity and the participant who changed it.
	if !strings.Contains(reject.Message, "table-1") || reject.LastWriter != "host-1" {
		t.Fatalf("conflict must name the entity and last writer, got %+v", reject)
	}
}

func TestIntegrationLateJoinReplaysFromBaseSnapshot(t *testing.T) {
	session, err := startCollaboration()
	if err != nil {
		t.Fatalf("start collaboration: %v", err)
	}
	defer session.stop()

	host, _ := integrationDial(t, session.URL, integrationHostHello())
	defer host.Close()
	operation := operationForTest("op-1", "host-1", map[string]uint64{"table-1": 0},
		`{"changes":[{"kind":"upsert","collection":"tables","id":"table-1","value":{"id":"table-1","name":"renamed"}}]}`)
	if err := host.WriteJSON(operation); err != nil {
		t.Fatalf("send operation: %v", err)
	}
	var ack collaborationMessage
	if err := host.ReadJSON(&ack); err != nil || ack.Type != "ack" {
		t.Fatalf("ack = %+v, err = %v", ack, err)
	}

	joiner, welcome := integrationDial(t, session.URL, integrationParticipantHello("peer-late"))
	defer joiner.Close()
	// The welcome must describe the base snapshot at revision 0 and the target
	// revision the replay will reach, otherwise a client that trusts the welcome
	// revision silently discards the replay.
	if welcome.Revision != 0 || welcome.TargetRevision != 1 {
		t.Fatalf("welcome base/target revision = %d/%d, want 0/1", welcome.Revision, welcome.TargetRevision)
	}
	var replayed collaborationMessage
	if err := joiner.ReadJSON(&replayed); err != nil || replayed.Type != "operation" || replayed.Revision != 1 {
		t.Fatalf("replayed operation = %+v, err = %v", replayed, err)
	}
}

func TestIntegrationReconnectReplacesStaleClient(t *testing.T) {
	session, err := startCollaboration()
	if err != nil {
		t.Fatalf("start collaboration: %v", err)
	}
	defer session.stop()

	host, _ := integrationDial(t, session.URL, integrationHostHello())
	defer host.Close()

	first, _ := integrationDial(t, session.URL, integrationParticipantHello("peer-reconnect"))
	defer first.Close()
	// A reconnect can race the old socket's cleanup. A new hello with the same
	// client ID must replace the stale peer instead of failing forever.
	second, welcome := integrationDial(t, session.URL, integrationParticipantHello("peer-reconnect"))
	defer second.Close()
	if welcome.Type != "welcome" {
		t.Fatalf("reconnect welcome = %+v", welcome)
	}
}

func TestIntegrationHostStopEndsSession(t *testing.T) {
	session, err := startCollaboration()
	if err != nil {
		t.Fatalf("start collaboration: %v", err)
	}
	defer session.stop()

	host, _ := integrationDial(t, session.URL, integrationHostHello())
	defer host.Close()
	participant, _ := integrationDial(t, session.URL, integrationParticipantHello("peer-stop"))
	defer participant.Close()

	if err := host.Close(); err != nil {
		t.Fatalf("host close: %v", err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		var message collaborationMessage
		_ = participant.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		err := participant.ReadJSON(&message)
		if err == nil {
			if message.Type == "session_ended" {
				return
			}
			continue
		}
		if netErr, ok := err.(interface{ Timeout() bool }); ok && netErr.Timeout() {
			continue
		}
		t.Fatalf("expected session_ended before close, got %v", err)
	}
	t.Fatal("participant never received session_ended")
}

func TestIntegrationLegacyFrameWithoutProtocolVersionRejected(t *testing.T) {
	session, err := startCollaboration()
	if err != nil {
		t.Fatalf("start collaboration: %v", err)
	}
	defer session.stop()

	conn, _, err := websocket.DefaultDialer.Dial(session.URL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()
	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"hello","clientId":"legacy","role":"host","documentId":"diagram-1"}`)); err != nil {
		t.Fatalf("send legacy frame: %v", err)
	}
	var response collaborationMessage
	if err := conn.ReadJSON(&response); err != nil {
		t.Fatalf("read handshake error: %v", err)
	}
	if response.Type != "error" || response.Code != "protocol_version_required" {
		t.Fatalf("legacy frame response = %+v, want protocol_version_required", response)
	}
}

func TestIntegrationWrongTokenRejected(t *testing.T) {
	session, err := startCollaboration()
	if err != nil {
		t.Fatalf("start collaboration: %v", err)
	}
	defer session.stop()

	badURL := strings.Replace(session.URL, session.Token, "wrong-token", 1)
	conn, resp, err := websocket.DefaultDialer.Dial(badURL, nil)
	if err == nil {
		_ = conn.Close()
		t.Fatal("wrong token was accepted")
	}
	if resp == nil || resp.StatusCode < 400 {
		t.Fatalf("wrong token response = %+v", resp)
	}
}

func TestIntegrationLargeCascadeOperationIsAtomic(t *testing.T) {
	sequencer, err := newCollaborationSequencerFromSnapshot(json.RawMessage(`{"id":"diagram-1","tables":[]}`))
	if err != nil {
		t.Fatalf("seed sequencer: %v", err)
	}
	changes := make([]map[string]any, 0, 200)
	versions := make(map[string]uint64, 200)
	for i := 0; i < 200; i++ {
		id := fmt.Sprintf("entity-%03d", i)
		changes = append(changes, map[string]any{
			"kind": "upsert", "collection": "tables", "id": id, "value": map[string]any{"id": id, "name": id},
		})
		versions[id] = 0
	}
	payload, err := json.Marshal(map[string]any{"changes": changes})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	operation := operationForTest("op-large", "host-1", versions, string(payload))
	decision := sequencer.accept(operation)
	if !decision.Accepted {
		t.Fatalf("large atomic operation rejected: %s: %s", decision.Code, decision.Message)
	}
	if decision.Revision != 1 || len(sequencer.operationLog) != 1 {
		t.Fatalf("expected exactly one sequenced operation, got revision %d, log %d", decision.Revision, len(sequencer.operationLog))
	}
}

func TestIntegrationTransientMessagesKeepRequiredFields(t *testing.T) {
	session, err := startCollaboration()
	if err != nil {
		t.Fatalf("start collaboration: %v", err)
	}
	defer session.stop()

	host, _ := integrationDial(t, session.URL, integrationHostHello())
	defer host.Close()
	sender, _ := integrationDial(t, session.URL, integrationParticipantHello("peer-sender"))
	defer sender.Close()
	observer, _ := integrationDial(t, session.URL, integrationParticipantHello("peer-observer"))
	defer observer.Close()

	readFrame := func(conn *websocket.Conn, wantType string) map[string]any {
		t.Helper()
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read %s frame: %v", wantType, err)
		}
		var frame map[string]any
		if err := json.Unmarshal(data, &frame); err != nil {
			t.Fatalf("decode %s frame: %v", wantType, err)
		}
		if frame["type"] != wantType {
			t.Fatalf("frame type = %v, want %s (%s)", frame["type"], wantType, data)
		}
		return frame
	}

	// An empty selection is meaningful: it clears remote selection outlines.
	if err := sender.WriteJSON(map[string]any{
		"protocolVersion": collaborationProtocolVersion,
		"type":            "selection",
		"clientId":        "peer-sender",
		"selection":       []string{},
	}); err != nil {
		t.Fatalf("send empty selection: %v", err)
	}
	for _, conn := range []*websocket.Conn{host, observer} {
		frame := readFrame(conn, "selection")
		selection, exists := frame["selection"]
		if !exists {
			t.Fatalf("relayed selection dropped the required selection field: %v", frame)
		}
		values, ok := selection.([]any)
		if !ok || len(values) != 0 {
			t.Fatalf("relayed selection = %v, want empty array", selection)
		}
	}

	// An empty editing target is the explicit "stopped editing" signal.
	if err := sender.WriteJSON(map[string]any{
		"protocolVersion": collaborationProtocolVersion,
		"type":            "editing",
		"clientId":        "peer-sender",
		"targetId":        "",
	}); err != nil {
		t.Fatalf("send stopped-editing: %v", err)
	}
	for _, conn := range []*websocket.Conn{host, observer} {
		frame := readFrame(conn, "editing")
		target, exists := frame["targetId"]
		if !exists || target != "" {
			t.Fatalf("relayed editing must carry explicit empty targetId: %v", frame)
		}
	}
}

func TestIntegrationLateJoinReceivesExistingPresence(t *testing.T) {
	session, err := startCollaboration()
	if err != nil {
		t.Fatalf("start collaboration: %v", err)
	}
	defer session.stop()

	hostHello := integrationHostHello()
	hostHello.Name = "Host One"
	host, _ := integrationDial(t, session.URL, hostHello)
	defer host.Close()

	peerHello := integrationParticipantHello("peer-1")
	peerHello.Name = "Peer B"
	peer, _ := integrationDial(t, session.URL, peerHello)
	defer peer.Close()

	late, _ := integrationDial(t, session.URL, integrationParticipantHello("peer-late"))
	defer late.Close()

	names := map[string]string{}
	for i := 0; i < 2; i++ {
		var frame collaborationMessage
		if err := late.ReadJSON(&frame); err != nil {
			t.Fatalf("presence frame %d: %v", i, err)
		}
		if frame.Type != "name" {
			t.Fatalf("frame %d type = %q, want name", i, frame.Type)
		}
		names[frame.ClientID] = frame.Name
	}
	for clientID, want := range map[string]string{"host-1": "Host One", "peer-1": "Peer B"} {
		if names[clientID] != want {
			t.Fatalf("late joiner presence for %s = %q, want %q (all: %v)", clientID, names[clientID], want, names)
		}
	}
}

func TestIntegrationVirtualAdaptersAreNotPrimaryInvites(t *testing.T) {
	for _, name := range []string{"vethabc123", "docker0", "br-12ab34", "virbr0", "Hyper-V Virtual Ethernet Adapter", "vmnet1", "wsl0", "tailscale0"} {
		if !isVirtualNetworkInterface(name) {
			t.Errorf("%q should be classified as a virtual adapter", name)
		}
	}
	for _, name := range []string{"eth0", "enp3s0", "wlan0", "Wi-Fi"} {
		if isVirtualNetworkInterface(name) {
			t.Errorf("%q should be classified as a primary adapter", name)
		}
	}
}
