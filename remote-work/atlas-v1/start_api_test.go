package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestHandleStartAPIMissingAtlasLocal(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("ATLAS_HOME", filepath.Join(home, "no-atlas"))
	t.Setenv("XDG_DATA_HOME", filepath.Join(home, ".xdg"))
	t.Setenv("LOCALAPPDATA", "")
	t.Setenv("PATH", "/usr/bin:/bin")

	emptyShell := filepath.Join(home, "empty-shell")
	req := httptest.NewRequest(http.MethodPost, "/start-api", nil)
	rr := httptest.NewRecorder()
	handleStartAPI(emptyShell)(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status %d want 404", rr.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != false {
		t.Fatalf("ok=%v", body["ok"])
	}
	errMsg, _ := body["error"].(string)
	if errMsg == "" || strings.Contains(errMsg, "à côté du shell") {
		t.Fatalf("error should be honest about search scope, got %q", errMsg)
	}
	hint, _ := body["hint"].(string)
	if hint == "" || !strings.Contains(hint, "install-atlas-prereqs") && !strings.Contains(hint, "AtlasLocal") {
		t.Fatalf("hint missing recovery, got %q", hint)
	}
	looked, ok := body["lookedIn"].([]any)
	if !ok || len(looked) == 0 {
		t.Fatalf("lookedIn should list roots, got %#v", body["lookedIn"])
	}
}

func TestHandleStartAPIMethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/start-api", nil)
	rr := httptest.NewRecorder()
	handleStartAPI(t.TempDir())(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status %d", rr.Code)
	}
}
