package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func TestPrependHomebrewNodePathLookPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("brew keg layout is Unix/macOS")
	}
	tmp := t.TempDir()
	keg := filepath.Join(tmp, "Cellar", "node@20", "20.11.0")
	bin := filepath.Join(keg, "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	node := filepath.Join(bin, "node")
	if err := os.WriteFile(node, []byte("#!/bin/sh\necho v20.11.0\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	brew := filepath.Join(tmp, "bin", "brew")
	if err := os.MkdirAll(filepath.Dir(brew), 0o755); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\n" +
		"if [ \"$1\" = \"--prefix\" ] && [ \"$2\" = \"node@20\" ]; then echo '" + keg + "'; exit 0; fi\n" +
		"exit 1\n"
	if err := os.WriteFile(brew, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	bare := tmp + "/bin:/usr/bin:/bin"
	t.Setenv("PATH", bare)
	if _, err := exec.LookPath("node"); err == nil {
		t.Fatal("expected node hidden on bare PATH before prepend")
	}

	prependHomebrewNodePath()

	got, err := exec.LookPath("node")
	if err != nil {
		t.Fatalf("LookPath node after prepend: %v (PATH=%s)", err, os.Getenv("PATH"))
	}
	if filepath.Clean(got) != filepath.Clean(node) {
		t.Fatalf("LookPath=%q want %q", got, node)
	}
}

func TestPrependHomebrewNodePathWellKnownBrewOffPATH(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("brew keg layout is Unix/macOS")
	}
	tmp := t.TempDir()
	keg := filepath.Join(tmp, "opt", "node@20")
	bin := filepath.Join(keg, "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	node := filepath.Join(bin, "node")
	if err := os.WriteFile(node, []byte("#!/bin/sh\necho v20.11.0\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	// brew lives OFF PATH (GUI macOS) — only absolute wellKnownBrewBins finds it.
	brew := filepath.Join(tmp, "homebrew", "bin", "brew")
	if err := os.MkdirAll(filepath.Dir(brew), 0o755); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\n" +
		"if [ \"$1\" = \"--prefix\" ] && [ \"$2\" = \"node@20\" ]; then echo '" + keg + "'; exit 0; fi\n" +
		"exit 1\n"
	if err := os.WriteFile(brew, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	prevBrew := wellKnownBrewBins
	prevKeg := wellKnownNodeKegBins
	wellKnownBrewBins = []string{brew}
	wellKnownNodeKegBins = nil
	t.Cleanup(func() {
		wellKnownBrewBins = prevBrew
		wellKnownNodeKegBins = prevKeg
	})

	t.Setenv("PATH", "/usr/bin:/bin") // no tmp/bin — brew not LookPath-able
	if _, err := exec.LookPath("brew"); err == nil {
		t.Fatal("brew must be off PATH for this test")
	}
	if _, err := exec.LookPath("node"); err == nil {
		t.Fatal("node must be hidden before prepend")
	}

	prependHomebrewNodePath()

	got, err := exec.LookPath("node")
	if err != nil {
		t.Fatalf("LookPath node via well-known brew: %v (PATH=%s)", err, os.Getenv("PATH"))
	}
	if filepath.Clean(got) != filepath.Clean(node) {
		t.Fatalf("LookPath=%q want %q", got, node)
	}
}

func TestPrependHomebrewNodePathDirectKegBins(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("brew keg layout is Unix/macOS")
	}
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "opt", "node@20", "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	node := filepath.Join(bin, "node")
	if err := os.WriteFile(node, []byte("#!/bin/sh\necho v20.11.0\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	prevBrew := wellKnownBrewBins
	prevKeg := wellKnownNodeKegBins
	wellKnownBrewBins = []string{filepath.Join(tmp, "missing-brew")}
	wellKnownNodeKegBins = []string{bin}
	t.Cleanup(func() {
		wellKnownBrewBins = prevBrew
		wellKnownNodeKegBins = prevKeg
	})

	t.Setenv("PATH", "/usr/bin:/bin")
	prependHomebrewNodePath()
	got, err := exec.LookPath("node")
	if err != nil {
		t.Fatalf("direct keg bin: %v", err)
	}
	if filepath.Clean(got) != filepath.Clean(node) {
		t.Fatalf("got %q want %q", got, node)
	}
}

func TestPrependHomebrewNodePathNoBrew(t *testing.T) {
	prevBrew := wellKnownBrewBins
	prevKeg := wellKnownNodeKegBins
	wellKnownBrewBins = []string{"/tmp/atlas-no-such-brew"}
	wellKnownNodeKegBins = []string{"/tmp/atlas-no-such-keg"}
	t.Cleanup(func() {
		wellKnownBrewBins = prevBrew
		wellKnownNodeKegBins = prevKeg
	})
	t.Setenv("PATH", "/usr/bin:/bin")
	before := os.Getenv("PATH")
	prependHomebrewNodePath()
	if os.Getenv("PATH") != before {
		t.Fatalf("PATH changed without brew/keg: %q → %q", before, os.Getenv("PATH"))
	}
}
