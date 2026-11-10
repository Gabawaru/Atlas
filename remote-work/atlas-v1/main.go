// Atlas desktop shell — opens local platform UI with Scan button.
// Cross-platform: Windows (Atlas.exe), Linux/macOS (atlas binary).
// Scan drives real mission flow via Atlas API (liability checkbox →
// owner-authorization operator-responsibility → Circuit A → Policy Guard / RoE →
// web.passive.presence.v1 + shortlist suite → report export).
// No Pragma Sign key/envelope on the product path. No secrets embedded.
package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	_ "embed"
)

//go:embed web/platform.html
var platformHTML []byte

const listenAddr = "127.0.0.1:17865"

func main() {
	appData := atlasAppDataDir()
	_ = os.MkdirAll(appData, 0o755)
	marker := filepath.Join(appData, "installed.txt")
	if _, err := os.Stat(marker); err != nil {
		_ = os.WriteFile(marker, []byte("Atlas multi-os shell\n"), 0o644)
	}
	exe, _ := os.Executable()
	installDir := filepath.Dir(exe)
	_ = os.WriteFile(filepath.Join(appData, "install-path.txt"), []byte(installDir+"\n"), 0o644)

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(platformHTML)
	})
	mux.HandleFunc("/start-api", handleStartAPI(installDir))
	mux.HandleFunc("/healthz", handleHealthz)

	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		_ = openBrowser("http://" + listenAddr + "/")
		messageBox("Atlas", alreadyOpenMessage(listenAddr))
		return
	}

	// Localhost CORS so Vite client (:3002) / site session can call shell stubs.
	srv := &http.Server{Handler: withLocalCORS(mux), ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = srv.Serve(ln) }()

	url := "http://" + listenAddr + "/"
	_ = openBrowser(url)

	msg := fmt.Sprintf(
		"Atlas — plateforme Scan ouverte dans le navigateur.\n\nURL: %s\nInstall: %s\nData: %s\nOS: %s/%s\n\nDémarrer l’API lance AtlasLocal start (stack locale).\nScan : cocher responsabilité → Circuit A → Policy Guard → suite passive.\n\nRoE: *.pragma-cloud.com, *.pragma-serve.com, *.pragma.mc",
		url, installDir, appData, runtime.GOOS, runtime.GOARCH,
	)
	go messageBox("Atlas", msg)
	select {}
}

func atlasAppDataDir() string {
	if runtime.GOOS == "windows" {
		if app := os.Getenv("APPDATA"); app != "" {
			return filepath.Join(app, "Atlas")
		}
	}
	if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
		return filepath.Join(xdg, "atlas")
	}
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "Atlas")
	}
	return filepath.Join(home, ".local", "share", "atlas")
}

func handleStartAPI(installDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")

		local := findAtlasLocal(installDir)
		if local == "" {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"ok":       false,
				"error":    "AtlasLocal introuvable à côté du shell Atlas",
				"hint":     startAPIHint(),
				"lookedIn": installDir,
			})
			return
		}

		cmd := exec.Command(local, "start")
		cmd.Dir = filepath.Dir(local)
		hideWindow(cmd)
		if err := cmd.Start(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"ok":    false,
				"error": err.Error(),
				"path":  local,
			})
			return
		}
		// Detach — start can take minutes (docker + pnpm). UI polls /v1/health.
		go func() { _ = cmd.Wait() }()

		writeJSON(w, http.StatusAccepted, map[string]any{
			"ok":      true,
			"path":    local,
			"message": "AtlasLocal start lancé — attendez que l’API réponde sur :3001 (Tester), puis Scan.",
			"hint":    startAPIHint(),
		})
	}
}

func findAtlasLocal(installDir string) string {
	names := atlasLocalNames()
	var candidates []string
	for _, name := range names {
		candidates = append(candidates,
			filepath.Join(installDir, name),
			filepath.Join(installDir, "tools", name),
		)
	}
	if localApp := os.Getenv("LOCALAPPDATA"); localApp != "" {
		for _, name := range names {
			candidates = append(candidates, filepath.Join(localApp, "AtlasLocal", name))
		}
	}
	if home, err := os.UserHomeDir(); err == nil {
		for _, name := range names {
			candidates = append(candidates,
				filepath.Join(home, ".local", "bin", name),
				filepath.Join(home, "bin", name),
			)
		}
	}
	if path, err := exec.LookPath("AtlasLocal"); err == nil {
		candidates = append(candidates, path)
	}
	for _, p := range candidates {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

func handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":      true,
		"service": "atlas-shell",
		"os":      runtime.GOOS,
		"arch":    runtime.GOARCH,
		"listen":  listenAddr,
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func localCORSOrigin(origin string) bool {
	switch origin {
	case "http://localhost:3002",
		"http://127.0.0.1:3002",
		"http://localhost:17865",
		"http://127.0.0.1:17865",
		"https://atlas-secu.com",
		"https://www.atlas-secu.com":
		return true
	default:
		return false
	}
}

func withLocalCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if localCORSOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}
