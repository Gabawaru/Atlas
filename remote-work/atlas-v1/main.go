// Atlas v1 desktop shell — opens local platform UI with Scan button.
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
	"syscall"
	"time"
	"unsafe"

	_ "embed"
)

//go:embed web/platform.html
var platformHTML []byte

const listenAddr = "127.0.0.1:17865"

func main() {
	appData := filepath.Join(os.Getenv("APPDATA"), "Atlas")
	if os.Getenv("APPDATA") == "" {
		home, _ := os.UserHomeDir()
		appData = filepath.Join(home, ".atlas")
	}
	_ = os.MkdirAll(appData, 0o755)
	marker := filepath.Join(appData, "installed.txt")
	if _, err := os.Stat(marker); err != nil {
		_ = os.WriteFile(marker, []byte("Atlas v1\n"), 0o644)
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

	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		_ = openBrowser("http://" + listenAddr + "/")
		messageBox("Atlas", "Interface Scan déjà ouverte sur http://"+listenAddr+"/\n\nSi rien ne s'affiche, fermez l'autre instance Atlas.exe.")
		return
	}

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = srv.Serve(ln) }()

	url := "http://" + listenAddr + "/"
	_ = openBrowser(url)

	msg := fmt.Sprintf(
		"Atlas v1 — plateforme Scan ouverte dans le navigateur.\n\nURL: %s\nInstall: %s\nAppData: %s\n\nDémarrer l’API lance AtlasLocal start (stack locale).\nScan : cocher responsabilité → Circuit A → Policy Guard → suite passive.\nFermer cette boîte ne coupe pas le serveur local.\n\nRoE: *.pragma-cloud.com, *.pragma-serve.com, *.pragma.mc",
		url, installDir, appData,
	)
	go messageBox("Atlas", msg)
	select {}
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
				"ok":      false,
				"error":   "AtlasLocal.exe introuvable à côté de Atlas.exe",
				"hint":    "Réinstallez via Atlas-Setup.exe (embarque AtlasLocal).",
				"lookedIn": installDir,
			})
			return
		}

		cmd := exec.Command(local, "start")
		cmd.Dir = filepath.Dir(local)
		if runtime.GOOS == "windows" {
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		}
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
			"hint":    "Si échec : une fois AtlasLocal.exe install (clone %USERPROFILE%\\Atlas + .env), puis Démarrer l’API.",
		})
	}
}

func findAtlasLocal(installDir string) string {
	candidates := []string{
		filepath.Join(installDir, "AtlasLocal.exe"),
		filepath.Join(installDir, "tools", "AtlasLocal.exe"),
	}
	if localApp := os.Getenv("LOCALAPPDATA"); localApp != "" {
		candidates = append(candidates, filepath.Join(localApp, "AtlasLocal", "AtlasLocal.exe"))
	}
	for _, p := range candidates {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
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

func messageBox(title, text string) {
	if runtime.GOOS != "windows" {
		fmt.Fprintf(os.Stderr, "%s\n%s\n", title, text)
		fmt.Fprintln(os.Stderr, "(press Enter to quit)")
		_, _ = fmt.Scanln()
		return
	}
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	b, _ := syscall.UTF16PtrFromString(text)
	proc.Call(0, uintptr(unsafe.Pointer(b)), uintptr(unsafe.Pointer(t)), 0x40)
}
