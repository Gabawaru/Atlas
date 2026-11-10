//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"syscall"
	"unsafe"
)

func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}

func messageBox(title, text string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	b, _ := syscall.UTF16PtrFromString(text)
	proc.Call(0, uintptr(unsafe.Pointer(b)), uintptr(unsafe.Pointer(t)), 0x40)
}

func atlasLocalNames() []string {
	return []string{"AtlasLocal.exe", "AtlasLocal"}
}

func startAPIHint() string {
	return "Si échec : une fois AtlasLocal install (clone %USERPROFILE%\\Atlas + .env), puis Démarrer l’API."
}

func alreadyOpenMessage(addr string) string {
	return fmt.Sprintf("Interface Scan déjà ouverte sur http://%s/\n\nSi rien ne s'affiche, fermez l'autre instance Atlas.", addr)
}
