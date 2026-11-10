//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
)

func hideWindow(cmd *exec.Cmd) {
	// No-op on Unix — processes are already headless-friendly.
}

func messageBox(title, text string) {
	fmt.Fprintf(os.Stderr, "%s\n%s\n", title, text)
}

func atlasLocalNames() []string {
	return []string{"AtlasLocal", "AtlasLocal.exe"}
}

func startAPIHint() string {
	return "Si échec : AtlasLocal install (clone ~/Atlas + .env), ou scripts/unix/install-atlas-prereqs.sh, puis Démarrer l’API."
}

func alreadyOpenMessage(addr string) string {
	return fmt.Sprintf("Interface Scan déjà ouverte sur http://%s/\n\nSi rien ne s'affiche, arrêtez l'autre processus Atlas (port 17865).", addr)
}
