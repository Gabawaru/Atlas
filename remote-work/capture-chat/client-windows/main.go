// Atlas Capture Chat — thin Windows client.
// Builds to capture-chat.exe (GOOS=windows GOARCH=amd64, CGO_ENABLED=0).
//
// Config (flags override env override capture-chat.env next to the exe):
//   CAPTURE_CHAT_URL, CAPTURE_CHAT_TOKEN, optional CAPTURE_CHAT_TASK
package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	cfg := loadConfig(os.Args[1:])
	if cfg.help {
		printHelp()
		os.Exit(0)
	}
	if cfg.url == "" || cfg.token == "" {
		fatal("Set CAPTURE_CHAT_URL and CAPTURE_CHAT_TOKEN (env, capture-chat.env, or -url/-token). See README.")
	}

	task := cfg.task
	if task == "" {
		fmt.Print("Task name: ")
		line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		task = strings.TrimSpace(line)
	}
	if task == "" {
		fatal("task name required")
	}

	filePath := cfg.file
	var cleanup string
	if filePath == "" {
		tmp, err := captureScreenshot()
		if err != nil {
			fatal("screenshot failed: %v\nTip: pass -file path\\to\\image.png instead.", err)
		}
		filePath = tmp
		cleanup = tmp
	}
	if cleanup != "" {
		defer os.Remove(cleanup)
	}

	if err := upload(cfg.url, cfg.token, task, filePath); err != nil {
		fatal("upload failed: %v", err)
	}
	fmt.Printf("OK — capture sent for task %q\n", task)
}

type config struct {
	url   string
	token string
	task  string
	file  string
	help  bool
}

func loadConfig(args []string) config {
	fileVals := readEnvFile(sidecarEnvPath())
	cfg := config{
		url:   first(os.Getenv("CAPTURE_CHAT_URL"), fileVals["CAPTURE_CHAT_URL"]),
		token: first(os.Getenv("CAPTURE_CHAT_TOKEN"), fileVals["CAPTURE_CHAT_TOKEN"]),
		task:  first(os.Getenv("CAPTURE_CHAT_TASK"), fileVals["CAPTURE_CHAT_TASK"]),
	}
	for i := 0; i < len(args); i++ {
		a := args[i]
		next := func() string {
			if i+1 < len(args) {
				i++
				return args[i]
			}
			return ""
		}
		switch a {
		case "-url", "--url":
			cfg.url = next()
		case "-token", "--token":
			cfg.token = next()
		case "-task", "--task":
			cfg.task = next()
		case "-file", "--file":
			cfg.file = next()
		case "-h", "--help", "help":
			cfg.help = true
		}
	}
	cfg.url = strings.TrimRight(strings.TrimSpace(cfg.url), "/")
	cfg.token = strings.TrimSpace(cfg.token)
	cfg.task = strings.TrimSpace(cfg.task)
	return cfg
}

func printHelp() {
	fmt.Println(`capture-chat.exe — send a screenshot/file to Atlas Capture Chat

Usage:
  capture-chat.exe [-url URL] [-token TOKEN] [-task NAME] [-file PATH]

Config:
  CAPTURE_CHAT_URL    e.g. http://192.168.1.10:8787
  CAPTURE_CHAT_TOKEN  shared bearer token (same as server)
  Optional capture-chat.env next to the exe with the same keys.

Without -file, takes a full-screen screenshot via PowerShell (Windows).`)
}

func first(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func sidecarEnvPath() string {
	exe, err := os.Executable()
	if err != nil {
		return "capture-chat.env"
	}
	return filepath.Join(filepath.Dir(exe), "capture-chat.env")
}

func readEnvFile(path string) map[string]string {
	out := map[string]string{}
	f, err := os.Open(path)
	if err != nil {
		return out
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		out[strings.TrimSpace(k)] = strings.Trim(strings.TrimSpace(v), `"'`)
	}
	return out
}

func captureScreenshot() (string, error) {
	tmp := filepath.Join(os.TempDir(), fmt.Sprintf("atlas-capture-%d.png", time.Now().UnixNano()))
	ps := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save('%s', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`, strings.ReplaceAll(tmp, `'`, `''`))
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", ps)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%w: %s", err, stderr.String())
	}
	if st, err := os.Stat(tmp); err != nil || st.Size() == 0 {
		return "", fmt.Errorf("empty screenshot at %s", tmp)
	}
	return tmp, nil
}

func upload(baseURL, token, task, filePath string) error {
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	_ = w.WriteField("taskName", task)
	part, err := w.CreateFormFile("file", filepath.Base(filePath))
	if err != nil {
		return err
	}
	if _, err := io.Copy(part, f); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, baseURL+"/api/captures", &body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(b))
	}
	fmt.Println(string(b))
	return nil
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
