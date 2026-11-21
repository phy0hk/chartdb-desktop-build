package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

// runCollaborationServer provides a lightweight Go host for browser-only
// development. The browser still sends the authoritative host hello and
// snapshot; this process only supplies the tokenized WebSocket listener.
func runCollaborationServer() {
	session, err := startCollaboration()
	if err != nil {
		fmt.Fprintf(os.Stderr, "could not start collaboration server: %v\n", err)
		return
	}
	defer session.stop()

	fmt.Printf("Collaboration host URL: %s\n", session.URL)
	for _, url := range session.URLs {
		fmt.Printf("Collaboration invite URL: %s\n", url)
	}
	fmt.Printf("Collaboration token: %s\n", session.Token)
	fmt.Println("Press Ctrl+C to stop the collaboration server.")

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	<-signals
}
