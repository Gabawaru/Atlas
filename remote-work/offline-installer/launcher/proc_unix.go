//go:build !windows

package main

import (
	"os"
	"os/exec"
	"strconv"
	"syscall"
)

func setDetached(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}
}

func processAlive(pid int) bool {
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return p.Signal(syscall.Signal(0)) == nil
}

func killProcessTree(pid int) {
	// Negative PID = process group started with Setpgid.
	if err := syscall.Kill(-pid, syscall.SIGTERM); err != nil {
		_ = exec.Command("kill", "-TERM", strconv.Itoa(pid)).Run()
	}
}
