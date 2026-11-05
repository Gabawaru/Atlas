// Atlas v1 desktop shell — opens local platform UI with Scan button.
// Scan drives real mission flow via Atlas API (Paradise attach → Circuit A →
// Policy Guard → web.passive.presence.v1 + shortlist suite → report export).
// No secrets, no scanners embedded; API must be reachable (AtlasLocal / pnpm).
package main

import (
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
	_ = os.WriteFile(filepath.Join(appData, "install-path.txt"), []byte(filepath.Dir(exe)+"\n"), 0o644)

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
		"Atlas v1 — plateforme Scan ouverte dans le navigateur.\n\nURL: %s\nInstall: %s\nAppData: %s\n\nLe bouton Scan enchaîne Paradise → Circuit A → Policy Guard → suite passive.\nFermer cette boîte ne coupe pas le serveur local — utilisez le gestionnaire de tâches pour quitter Atlas.exe.\n\nRoE: *.pragma-cloud.com, *.pragma-serve.com, *.pragma.mc",
		url, filepath.Dir(exe), appData,
	)
	// Inform once, then keep serving the Scan UI until process kill.
	go messageBox("Atlas", msg)
	select {}
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
