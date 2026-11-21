package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	maxCollaborationMessage = 8 << 20
	collaborationQueueSize  = 64
	writeWait               = 10 * time.Second
	pongWait                = 60 * time.Second
	pingPeriod              = (pongWait * 9) / 10
)

type CollaborationSession struct {
	URL     string   `json:"url"`
	URLs    []string `json:"urls"`
	Token   string   `json:"token"`
	stop    func()
	isEnded func() bool
}

type collaborationPeer struct {
	conn     *websocket.Conn
	outbound chan []byte
	done     chan struct{}
	closeMu  sync.Once
	clientID string
	role     string
	name     string
	// replaced is set when a newer socket takes over the same client ID. The
	// old peer's cleanup must then avoid broadcasting a misleading leave.
	replaced bool
}

func (p *collaborationPeer) shutdown() {
	p.closeMu.Do(func() {
		close(p.done)
		if p.conn != nil {
			_ = p.conn.Close()
		}
	})
}

type collaborationHub struct {
	mu         sync.Mutex
	clients    map[*collaborationPeer]struct{}
	latest     []byte
	mode       string
	documentID string
	hostClient string
	snapshot   []byte
	sequencer  *collaborationSequencer
	ended      bool
}

var collaborationUpgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func (h *collaborationHub) serve(w http.ResponseWriter, r *http.Request) {
	conn, err := collaborationUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	conn.SetReadLimit(maxCollaborationMessage)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	kind, firstMessage, err := conn.ReadMessage()
	if err != nil {
		_ = conn.Close()
		return
	}
	if kind != websocket.TextMessage || len(firstMessage) > maxCollaborationMessage || !json.Valid(firstMessage) {
		_ = conn.Close()
		return
	}

	peer := &collaborationPeer{
		conn:     conn,
		outbound: make(chan []byte, collaborationQueueSize),
		done:     make(chan struct{}),
	}
	if !hasProtocolVersion(firstMessage) {
		h.writeHandshakeError(conn, "protocol_version_required")
		return
	}
	h.serveTyped(peer, firstMessage)
}

func (p *collaborationPeer) writePump() {
	defer p.shutdown()
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()
	for {
		select {
		case <-p.done:
			return
		case message := <-p.outbound:
			if err := p.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
				return
			}
			if err := p.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			if err := p.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeWait)); err != nil {
				return
			}
		}
	}
}

func (h *collaborationHub) broadcast(sender *collaborationPeer, data []byte) {
	var message struct {
		Type string `json:"type"`
	}
	_ = json.Unmarshal(data, &message)
	isPresence := message.Type == "cursor" || message.Type == "name" || message.Type == "editing"

	var slowPeers []*collaborationPeer
	h.mu.Lock()
	if !isPresence {
		h.latest = append(h.latest[:0], data...)
	}
	for peer := range h.clients {
		if peer == sender {
			continue
		}
		select {
		case peer.outbound <- append([]byte(nil), data...):
		default:
			delete(h.clients, peer)
			slowPeers = append(slowPeers, peer)
		}
	}
	h.mu.Unlock()

	for _, peer := range slowPeers {
		peer.shutdown()
	}
}

func (h *collaborationHub) removePeer(peer *collaborationPeer) {
	h.mu.Lock()
	if peer.replaced {
		h.mu.Unlock()
		peer.shutdown()
		return
	}
	delete(h.clients, peer)
	var remaining []*collaborationPeer
	hostLeft := peer.role == "host" && h.mode == "typed"
	if hostLeft {
		h.ended = true
		for other := range h.clients {
			delete(h.clients, other)
			remaining = append(remaining, other)
		}
	} else {
		for other := range h.clients {
			remaining = append(remaining, other)
		}
	}
	h.mu.Unlock()
	peer.shutdown()
	if peer.role != "" && peer.role != "host" && !hostLeft {
		leave, err := encodeCollaborationMessage(collaborationMessage{
			ProtocolVersion: collaborationProtocolVersion,
			Type:            "leave",
			ClientID:        peer.clientID,
		})
		if err == nil {
			for _, other := range remaining {
				enqueueCollaborationMessage(other, leave)
			}
		}
	}
	if hostLeft {
		h.notifySessionEnded(remaining)
	}
}

// notifySessionEnded tells participants why the session closed before their
// sockets are shut down, so the UI can show a clear, actionable state.
func (h *collaborationHub) notifySessionEnded(peers []*collaborationPeer) {
	ended, err := encodeCollaborationMessage(collaborationMessage{
		ProtocolVersion: collaborationProtocolVersion,
		Type:            "session_ended",
		Message:         "The host ended the collaboration session",
	})
	if err == nil {
		for _, peer := range peers {
			enqueueCollaborationMessageWait(peer, ended, writeWait)
		}
	}
	// Give the write pumps time to flush the typed notice before closing.
	time.AfterFunc(250*time.Millisecond, func() {
		for _, peer := range peers {
			peer.shutdown()
		}
	})
}

func startCollaboration() (CollaborationSession, error) {
	listener, err := net.Listen("tcp", "0.0.0.0:0")
	if err != nil {
		return CollaborationSession{}, err
	}
	bytes := make([]byte, 24)
	if _, err = rand.Read(bytes); err != nil {
		_ = listener.Close()
		return CollaborationSession{}, err
	}
	token := hex.EncodeToString(bytes)
	hub := &collaborationHub{clients: make(map[*collaborationPeer]struct{})}
	mux := http.NewServeMux()
	mux.HandleFunc("/collaborate/"+token, hub.serve)
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = server.Serve(listener) }()
	stop := func() {
		hub.closeAll()
		_ = server.Close()
	}
	ips, err := localIPv4Addresses()
	if err != nil || len(ips) == 0 {
		stop()
		return CollaborationSession{}, errors.New("could not determine a local network address")
	}
	port := listener.Addr().(*net.TCPAddr).Port
	urls := make([]string, 0, len(ips))
	for _, ip := range ips {
		urls = append(urls, fmt.Sprintf("ws://%s:%d/collaborate/%s", ip, port, token))
	}
	// Keep the host's own WebSocket on loopback. Interface addresses can point
	// at Docker/WSL/VM adapters that are not reachable from the Wails WebView,
	// while the advertised URLs remain available for other devices.
	return CollaborationSession{
		URL:     fmt.Sprintf("ws://127.0.0.1:%d/collaborate/%s", port, token),
		URLs:    urls,
		Token:   token,
		stop:    stop,
		isEnded: hub.isEnded,
	}, nil
}

func (h *collaborationHub) isEnded() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.ended
}

func (h *collaborationHub) closeAll() {
	h.mu.Lock()
	h.ended = true
	peers := make([]*collaborationPeer, 0, len(h.clients))
	for peer := range h.clients {
		delete(h.clients, peer)
		peers = append(peers, peer)
	}
	h.mu.Unlock()
	for _, peer := range peers {
		peer.shutdown()
	}
}

func localIPv4Addresses() ([]string, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}
	var privateAddresses, otherAddresses []string
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 || isVirtualNetworkInterface(iface.Name) {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ip, _, err := net.ParseCIDR(addr.String())
			if err == nil && ip.To4() != nil {
				if ip.IsPrivate() {
					privateAddresses = append(privateAddresses, ip.String())
				} else if ip.IsGlobalUnicast() && !ip.IsLinkLocalUnicast() {
					otherAddresses = append(otherAddresses, ip.String())
				}
			}
		}
	}
	return uniqueStrings(append(privateAddresses, otherAddresses...)), nil
}

// isVirtualNetworkInterface filters adapters that are not reachable by another
// device on the LAN (Docker/WSL/VM/bridge/VPN/Tailscale). Advertising them as
// invite URLs produces unusable addresses and, in WSL2, breaks the host itself.
func isVirtualNetworkInterface(name string) bool {
	lower := strings.ToLower(name)
	virtualPrefixes := []string{
		"veth", "docker", "br-", "virbr", "vmnet", "vboxnet", "hyper-v virtual",
		"wsl", "tailscale", "zerotier", "utun", "tun", "tap", "vpn", "vswitch",
		"lxc", "cni", "flannel", "cali", "cni0", "bridge", "bond", "dummy", "lo:",
	}
	for _, prefix := range virtualPrefixes {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	virtualExact := map[string]bool{
		"docker0": true, "virbr0": true, "vmnet1": true, "vmnet8": true,
		"tailscale0": true, "zerotier1": true, "wsl0": true, "veth0": true,
	}
	return virtualExact[lower]
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	return unique
}
