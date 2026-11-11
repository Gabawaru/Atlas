package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func writeFakeBin(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("#!/bin/sh\necho atlaslocal-stub\n"), 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestFindAtlasLocalBesideInstall(t *testing.T) {
	dir := t.TempDir()
	want := filepath.Join(dir, "AtlasLocal")
	writeFakeBin(t, want)
	got, _ := findAtlasLocal(dir)
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFindAtlasLocalHomeAtlasUnix(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix home layout")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home) // some Go builds consult this
	t.Setenv("ATLAS_HOME", "")
	t.Setenv("XDG_DATA_HOME", filepath.Join(home, ".xdg"))
	t.Setenv("LOCALAPPDATA", "")
	t.Setenv("PATH", "/usr/bin:/bin")

	want := filepath.Join(home, "Atlas", "bin", "AtlasLocal")
	writeFakeBin(t, want)

	got, _ := findAtlasLocal(filepath.Join(home, "empty-shell-dir"))
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFindAtlasLocalATLAS_HOME(t *testing.T) {
	home := t.TempDir()
	atlasHome := filepath.Join(home, "custom-atlas")
	t.Setenv("HOME", home)
	t.Setenv("ATLAS_HOME", atlasHome)
	t.Setenv("XDG_DATA_HOME", filepath.Join(home, ".xdg"))
	t.Setenv("LOCALAPPDATA", "")
	t.Setenv("PATH", "/usr/bin:/bin")

	want := filepath.Join(atlasHome, "AtlasLocal")
	writeFakeBin(t, want)

	got, _ := findAtlasLocal(filepath.Join(home, "no-sibling"))
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFindAtlasLocalAppDataInstallPath(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("ATLAS_HOME", filepath.Join(home, "unused-atlas-home"))
	t.Setenv("LOCALAPPDATA", "")
	t.Setenv("PATH", "/usr/bin:/bin")

	appData := filepath.Join(home, "Library", "Application Support", "Atlas")
	if runtime.GOOS != "darwin" {
		appData = filepath.Join(home, ".xdg", "atlas")
		t.Setenv("XDG_DATA_HOME", filepath.Join(home, ".xdg"))
	} else {
		t.Setenv("XDG_DATA_HOME", "")
	}

	prev := filepath.Join(home, "previous-payload")
	want := filepath.Join(prev, "AtlasLocal")
	writeFakeBin(t, want)
	if err := os.MkdirAll(appData, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(appData, "install-path.txt"), []byte(prev+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	got, _ := findAtlasLocal(filepath.Join(home, "current-empty"))
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFindAtlasLocalMissing(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("ATLAS_HOME", filepath.Join(home, "nope"))
	t.Setenv("XDG_DATA_HOME", filepath.Join(home, ".xdg"))
	t.Setenv("LOCALAPPDATA", "")
	t.Setenv("PATH", "/usr/bin:/bin")

	got, _ := findAtlasLocal(filepath.Join(home, "empty"))
	if got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}
