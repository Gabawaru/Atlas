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
	// Policy Guard: only pragma-serve.com apex is §3-listed; bare cloud/mc REJECT.
	if !strings.Contains(html, `ROE_EXPLICIT_APEXES = ["pragma-serve.com"]`) {
		t.Fatalf("ROE_EXPLICIT_APEXES must be pragma-serve.com only (Policy Guard parity)")
	}
	if strings.Contains(html, `"pragma-cloud.com"`) || strings.Contains(html, `"pragma.mc"`) {
		t.Fatalf("platform.html must not list bare pragma-cloud.com / pragma.mc as explicit apexes")
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

// Success / prompt deep-link status must use French labels (parity Vite formatAuthorizedLaunchBanner).
func TestPlatformHTMLDeepLinkActionLabels(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("web", "platform.html"))
	if err != nil {
		t.Fatalf("read platform.html: %v", err)
	}
	html := string(raw)
	needles := []string{
		"AUTHORIZED_ACTION_LABELS",
		`recon: "Reconnaissance"`,
		`scan: "Scan"`,
		`vuln: "Évaluation de vulnérabilités"`,
		`osint: "OSINT"`,
		`actionLabel = AUTHORIZED_ACTION_LABELS[action] || action`,
		`Deep-link « " + actionLabel + " » · `,
	}
	for _, n := range needles {
		if !strings.Contains(html, n) {
			t.Fatalf("platform.html missing deep-link label marker %q", n)
		}
	}
	// Must not keep raw action id in the success banner (Vite uses label).
	if strings.Contains(html, `Deep-link « " + action + " » · `) {
		t.Fatalf("success Deep-link banner must use actionLabel, not raw action id")
	}
}

// Button + offline status must use accented Démarrer (parity Vite localShell label/hint).
func TestPlatformHTMLDemarrerAccent(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("web", "platform.html"))
	if err != nil {
		t.Fatalf("read platform.html: %v", err)
	}
	html := string(raw)
	if !strings.Contains(html, "Démarrer l'API") {
		t.Fatalf("platform.html missing accented Démarrer l'API")
	}
	if strings.Contains(html, "Demarrer l'API") {
		t.Fatalf("platform.html still has unaccented Demarrer l'API")
	}
}

// Start Menu / desktop shortcut names must match platform Démarrer (#97) accents.
func TestNsisDemarrerAccent(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("installer", "Atlas.nsi"))
	if err != nil {
		t.Fatalf("read Atlas.nsi: %v", err)
	}
	nsi := string(raw)
	if !strings.Contains(nsi, `Démarrer l'API.lnk`) {
		t.Fatalf("Atlas.nsi missing accented Démarrer l'API.lnk")
	}
	if strings.Contains(nsi, `Demarrer l'API.lnk`) {
		t.Fatalf("Atlas.nsi still has unaccented Demarrer l'API.lnk")
	}
	if !strings.Contains(nsi, `Désinstaller Atlas.lnk`) {
		t.Fatalf("Atlas.nsi missing accented Désinstaller Atlas.lnk")
	}
	if strings.Contains(nsi, `Desinstaller Atlas.lnk`) {
		t.Fatalf("Atlas.nsi still has unaccented Desinstaller Atlas.lnk")
	}
}

// Progress setStatus lines must keep FR accents (Démarrage / Exécution / Responsabilité).
func TestPlatformHTMLStatusAccents(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("web", "platform.html"))
	if err != nil {
		t.Fatalf("read platform.html: %v", err)
	}
	html := string(raw)
	need := []string{
		`setStatus("Démarrage API…");`,
		`setStatus("Démarrage… "`,
		`setStatus("Exécution…");`,
		`setStatus("Responsabilité…");`,
	}
	for _, n := range need {
		if !strings.Contains(html, n) {
			t.Fatalf("platform.html missing accented status %q", n)
		}
	}
	for _, bad := range []string{
		`setStatus("Demarrage API…");`,
		`setStatus("Demarrage… "`,
		`setStatus("Execution…");`,
		`setStatus("Responsabilite…");`,
	} {
		if strings.Contains(html, bad) {
			t.Fatalf("platform.html still has unaccented status %q", bad)
		}
	}
}

// After /start-api 202, health poll timeout must still surface recovery hint (parity fail path).
func TestPlatformHTMLStartApiTimeoutKeepsHint(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("web", "platform.html"))
	if err != nil {
		t.Fatalf("read platform.html: %v", err)
	}
	html := string(raw)
	needles := []string{
		`const hint = data && data.hint ? String(data.hint) : "";`,
		`API toujours hors ligne." + (hint ? "\n" + hint : "")`,
	}
	for _, n := range needles {
		if !strings.Contains(html, n) {
			t.Fatalf("platform.html missing start-api timeout hint marker %q", n)
		}
	}
	bare := `setStatus("API toujours hors ligne.", "err");`
	if strings.Contains(html, bare) {
		t.Fatalf("timeout status must append hint, not bare hors-ligne line")
	}
}

// startApi network catch must append shell recovery (parity Vite Session #92).
func TestPlatformHTMLStartApiNetworkCatchHint(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("web", "platform.html"))
	if err != nil {
		t.Fatalf("read platform.html: %v", err)
	}
	html := string(raw)
	needles := []string{
		`failed to fetch|networkerror|load failed|network request failed`,
		"Shell hors ligne — lancez `pnpm atlas:shell`",
		`setStatus(msg, "err");`,
	}
	for _, n := range needles {
		if !strings.Contains(html, n) {
			t.Fatalf("platform.html missing start-api network catch marker %q", n)
		}
	}
	// startApi catch must use msg+recovery, not the old bare one-liner adjacent to finally.
	startIdx := strings.Index(html, `async function startApi`)
	if startIdx < 0 {
		t.Fatal("startApi function missing")
	}
	snippet := html[startIdx:]
	if end := strings.Index(snippet, `async function ensureLogin`); end > 0 {
		snippet = snippet[:end]
	}
	if strings.Contains(snippet, `setStatus(e instanceof Error ? e.message : String(e), "err");`) {
		t.Fatalf("startApi catch still dumps bare e.message without shell recovery")
	}
}
