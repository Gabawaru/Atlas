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

// Pages → shell deep-link (?action=&host=) must prefill RoE host (parity with Vite client).
func TestPlatformHTMLAppliesLaunchQuery(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("web", "platform.html"))
	if err != nil {
		t.Fatalf("read platform.html: %v", err)
	}
	html := string(raw)
	needles := []string{
		"function applyLaunchFromQuery",
		"function normalizeLaunchHost",
		"applyLaunchFromQuery(location.search)",
		`$("target").value = host`,
	}
	for _, n := range needles {
		if !strings.Contains(html, n) {
			t.Fatalf("platform.html missing launch prefill marker %q", n)
		}
	}
	boot := "syncScanEnabled();\n    applyLaunchFromQuery(location.search);\n    void ping();"
	if !strings.Contains(html, boot) {
		t.Fatalf("platform.html boot must call applyLaunchFromQuery before ping")
	}
}

// Deep-link action must be allowlisted (parity with Vite isAuthorizedAction).
func TestPlatformHTMLActionAllowlist(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("web", "platform.html"))
	if err != nil {
		t.Fatalf("read platform.html: %v", err)
	}
	html := string(raw)
	needles := []string{
		`AUTHORIZED_ACTIONS = ["recon", "scan", "vuln", "osint"]`,
		"function isAuthorizedAction",
		"Action « \" + action + \" » non autorisée",
	}
	for _, n := range needles {
		if !strings.Contains(html, n) {
			t.Fatalf("platform.html missing action allowlist marker %q", n)
		}
	}
	actionIdx := strings.Index(html, "isAuthorizedAction(action)")
	hostIdx := strings.Index(html, `$("target").value = host`)
	if actionIdx < 0 || hostIdx < 0 || actionIdx > hostIdx {
		t.Fatalf("isAuthorizedAction must gate before target prefill (action=%d host=%d)", actionIdx, hostIdx)
	}
}
