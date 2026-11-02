//go:build windows

package main

import (
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

const createNewProcessGroup = 0x00000200

func setDetached(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNewProcessGroup,
	}
}

func processAlive(pid int) bool {
	// On Windows FindProcess always succeeds for any pid; ask tasklist.
	out, err := exec.Command("tasklist", "/FI", "PID eq "+strconv.Itoa(pid), "/NH").Output()
	if err != nil {
		return false
	}
	s := string(out)
	if strings.Contains(s, "No tasks") || strings.Contains(s, "Aucune") {
		return false
	}
	return strings.Contains(s, strconv.Itoa(pid))
}

func killProcessTree(pid int) {
	_ = exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/T", "/F").Run()
}
