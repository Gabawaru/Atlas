package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Scan shell must refuse hors-RoE targets before POST mission (parity with #79 client CTA).
func TestPlatformHTMLHasRoePrecheck(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("web", "platform.html"))
	if err != nil {
		t.Fatalf("read platform.html: %v", err)
	}
	html := string(raw)
	needles := []string{
		"function isAuthorizedRoeHost",
		"Cible hors RoE",
		"ROE_SCOPE_PATTERNS",
		"*.pragma-serve.com",
		"*.pragma-cloud.com",
		"*.pragma.mc",
	}
	for _, n := range needles {
		if !strings.Contains(html, n) {
			t.Fatalf("platform.html missing RoE precheck marker %q", n)
		}
	}
	// Fail-closed: check must run before ensureAsset / mission POST.
	roeIdx := strings.Index(html, "isAuthorizedRoeHost(target)")
	assetIdx := strings.Index(html, "ensureAsset(target)")
	if roeIdx < 0 || assetIdx < 0 || roeIdx > assetIdx {
		t.Fatalf("isAuthorizedRoeHost must gate before ensureAsset (roe=%d asset=%d)", roeIdx, assetIdx)
	}
}
