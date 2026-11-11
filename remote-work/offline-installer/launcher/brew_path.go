package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Well-known Homebrew locations when GUI PATH omits /opt/homebrew/bin
// (macOS Finder / sanitized login). Overridable in tests.
var wellKnownBrewBins = []string{
	"/opt/homebrew/bin/brew", // Apple Silicon
	"/usr/local/bin/brew",    // Intel Mac
}

// Direct keg bin dirs when brew binary itself is missing from PATH probes.
var wellKnownNodeKegBins = []string{
	"/opt/homebrew/opt/node@20/bin",
	"/opt/homebrew/opt/node/bin",
	"/usr/local/opt/node@20/bin",
	"/usr/local/opt/node/bin",
}

func resolveBrew() string {
	if p, err := exec.LookPath("brew"); err == nil {
		return p
	}
	for _, p := range wellKnownBrewBins {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

func prependPathDir(path, bin string) string {
	if bin == "" {
		return path
	}
	if st, err := os.Stat(bin); err != nil || !st.IsDir() {
		return path
	}
	sep := string(os.PathListSeparator)
	if path == "" {
		return bin
	}
	if strings.Contains(sep+path+sep, sep+bin+sep) {
		return path
	}
	return bin + sep + path
}

// prependHomebrewNodePath puts keg-only Homebrew node@20 (or node) on PATH.
// Mirrors scripts/unix/install-atlas-prereqs.sh (#74) for AtlasLocal runtime
// (POST /start-api → AtlasLocal start) where a fresh GUI/shell PATH misses Cellar.
// Fail-soft: no brew / empty prefix → try well-known keg bins, else no-op.
func prependHomebrewNodePath() {
	path := os.Getenv("PATH")
	brew := resolveBrew()
	if brew != "" {
		for _, formula := range []string{"node@20", "node"} {
			out, err := exec.Command(brew, "--prefix", formula).Output()
			if err != nil {
				continue
			}
			prefix := strings.TrimSpace(string(out))
			if prefix == "" {
				continue
			}
			path = prependPathDir(path, filepath.Join(prefix, "bin"))
		}
	} else {
		for _, bin := range wellKnownNodeKegBins {
			path = prependPathDir(path, bin)
		}
	}
	_ = os.Setenv("PATH", path)
}
