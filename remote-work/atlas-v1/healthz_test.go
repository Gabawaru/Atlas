package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"
)

func TestHandleHealthzJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()
	handleHealthz(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Fatalf("content-type %q", ct)
	}

	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != true {
		t.Fatalf("ok=%v", body["ok"])
	}
	if body["service"] != "atlas-shell" {
		t.Fatalf("service=%v", body["service"])
	}
	if body["listen"] != listenAddr {
		t.Fatalf("listen=%v", body["listen"])
	}
	if body["os"] != runtime.GOOS {
		t.Fatalf("os=%v want %s", body["os"], runtime.GOOS)
	}
	if body["arch"] != runtime.GOARCH {
		t.Fatalf("arch=%v want %s", body["arch"], runtime.GOARCH)
	}
}
