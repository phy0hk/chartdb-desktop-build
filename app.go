package main

import (
	"context"
	"fmt"
	"sync"
)

// App struct
type App struct {
	ctx             context.Context
	collaborationMu sync.Mutex
	collaboration   *CollaborationSession
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) StartCollaboration() (CollaborationSession, error) {
	a.collaborationMu.Lock()
	defer a.collaborationMu.Unlock()
	if a.collaboration != nil {
		if a.collaboration.isEnded == nil || !a.collaboration.isEnded() {
			return *a.collaboration, nil
		}
		a.collaboration.stop()
		a.collaboration = nil
	}
	session, err := startCollaboration()
	if err != nil {
		return CollaborationSession{}, err
	}
	a.collaboration = &session
	return session, nil
}

func (a *App) StopCollaboration() {
	a.collaborationMu.Lock()
	defer a.collaborationMu.Unlock()
	if a.collaboration != nil {
		a.collaboration.stop()
		a.collaboration = nil
	}
}

func (a *App) shutdown(context.Context) {
	a.StopCollaboration()
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
