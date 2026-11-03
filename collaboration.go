package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

const maxCollaborationMessage = 8 << 20

type CollaborationSession struct {
	URL   string   `json:"url"`
	URLs  []string `json:"urls"`
	Token string   `json:"token"`
	stop  func()
}

type collaborationHub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]bool
	latest  []byte
}

var collaborationUpgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func (h *collaborationHub) serve(w http.ResponseWriter, r *http.Request) {
	conn, err := collaborationUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.SetReadLimit(maxCollaborationMessage)
	h.mu.Lock()
	h.clients[conn] = true
	if len(h.latest) > 0 {
		_ = conn.WriteMessage(websocket.TextMessage, h.latest)
	}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.clients, conn)
		h.mu.Unlock()
	}()
	for {
		kind, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if kind != websocket.TextMessage || len(data) > maxCollaborationMessage || !json.Valid(data) {
			return
		}
		var message struct {
			Type string `json:"type"`
		}
		_ = json.Unmarshal(data, &message)
		h.mu.Lock()
		if message.Type != "cursor" && message.Type != "name" && message.Type != "editing" {
			h.latest = append(h.latest[:0], data...)
		}
		for peer := range h.clients {
			if peer != conn {
				_ = peer.WriteMessage(websocket.TextMessage, data)
			}
		}
		h.mu.Unlock()
	}
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
	hub := &collaborationHub{clients: make(map[*websocket.Conn]bool)}
	mux := http.NewServeMux()
	mux.HandleFunc("/collaborate/"+token, hub.serve)
	server := &http.Server{Handler: mux}
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
	return CollaborationSession{
		URL:   urls[0],
		URLs:  urls,
		Token: token,
		stop:  stop,
	}, nil
}

func (h *collaborationHub) closeAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for conn := range h.clients {
		_ = conn.Close()
		delete(h.clients, conn)
	}
}

func localIPv4Addresses() ([]string, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}
	var addresses []string
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ip, _, err := net.ParseCIDR(addr.String())
			if err == nil && ip.To4() != nil {
				addresses = append(addresses, ip.String())
			}
		}
	}
	return addresses, nil
}
