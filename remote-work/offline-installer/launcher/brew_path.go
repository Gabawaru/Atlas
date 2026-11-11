package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// prependHomebrewNodePath puts keg-only Homebrew node@20 (or node) on PATH.
// Mirrors scripts/unix/install-atlas-prereqs.sh (#74) for AtlasLocal runtime
// (POST /start-api → AtlasLocal start) where a fresh GUI/shell PATH misses Cellar.
// Fail-soft: no brew / empty prefix → no-op.
func prependHomebrewNodePath() {
	brew, err := exec.LookPath("brew")
	if err != nil {
		return
	}
	path := os.Getenv("PATH")
	for _, formula := range []string{"node@20", "node"} {
		out, err := exec.Command(brew, "--prefix", formula).Output()
		if err != nil {
			continue
		}
		prefix := strings.TrimSpace(string(out))
		if prefix == "" {
			continue
		}
		bin := filepath.Join(prefix, "bin")
		if st, err := os.Stat(bin); err != nil || !st.IsDir() {
			continue
		}
		sep := string(os.PathListSeparator)
		if path == "" {
			path = bin
		} else if !strings.Contains(sep+path+sep, sep+bin+sep) {
			path = bin + sep + path
		}
	}
	_ = os.Setenv("PATH", path)
}
