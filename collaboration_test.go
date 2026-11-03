package main

import (
	"bytes"
	"testing"
)

func TestBroadcastQueuesMessagesWithoutWritingUnderHubLock(t *testing.T) {
	sender := &collaborationPeer{outbound: make(chan []byte, 1), done: make(chan struct{})}
	receiver := &collaborationPeer{outbound: make(chan []byte, 1), done: make(chan struct{})}
	hub := &collaborationHub{
		clients: map[*collaborationPeer]struct{}{
			sender:   {},
			receiver: {},
		},
	}
	message := []byte(`{"type":"operation","id":"op-1"}`)

	hub.broadcast(sender, message)

	if got := <-receiver.outbound; !bytes.Equal(got, message) {
		t.Fatalf("receiver got %q, want %q", got, message)
	}
	if len(sender.outbound) != 0 {
		t.Fatal("sender should not receive its own message")
	}
	if !bytes.Equal(hub.latest, message) {
		t.Fatalf("latest message is %q, want %q", hub.latest, message)
	}
}

func TestPresenceDoesNotReplaceLatestDurableMessage(t *testing.T) {
	peer := &collaborationPeer{outbound: make(chan []byte, 2), done: make(chan struct{})}
	hub := &collaborationHub{clients: map[*collaborationPeer]struct{}{peer: {}}}
	durable := []byte(`{"type":"operation","id":"op-1"}`)
	presence := []byte(`{"type":"cursor","id":"peer-1"}`)

	hub.broadcast(nil, durable)
	hub.broadcast(nil, presence)

	if !bytes.Equal(hub.latest, durable) {
		t.Fatalf("latest message is %q, want durable message %q", hub.latest, durable)
	}
	if len(peer.outbound) != 2 {
		t.Fatalf("queued %d messages, want 2", len(peer.outbound))
	}
}

func TestSlowPeerIsRemovedWhenOutboundQueueIsFull(t *testing.T) {
	peer := &collaborationPeer{outbound: make(chan []byte, 1), done: make(chan struct{})}
	peer.outbound <- []byte("queued")
	hub := &collaborationHub{clients: map[*collaborationPeer]struct{}{peer: {}}}

	hub.broadcast(nil, []byte(`{"type":"operation"}`))

	if _, exists := hub.clients[peer]; exists {
		t.Fatal("slow peer should be removed from the hub")
	}
	select {
	case <-peer.done:
	default:
		t.Fatal("slow peer connection should be shut down")
	}
}
