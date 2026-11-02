// AtlasLocal — Windows launcher for Gab workflow WITHOUT Cursor / agent worker.
//
// Cross-compile:
//   CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o ../bin/AtlasLocal.exe .
//
// Commands:
//   AtlasLocal.exe install   — clone Atlas (if missing), ensure .env from example
//   AtlasLocal.exe update    — git fetch + pull (preserves .env)
//   AtlasLocal.exe start     — docker compose up -d + pnpm install + demo smoke hint
//   AtlasLocal.exe stop      — docker compose stop
//   AtlasLocal.exe status    — show install dir, git HEAD, docker/node presence
//   AtlasLocal.exe watch     — loop: update then start; poll every ATLAS_WATCH_SECONDS (default 300)
//   AtlasLocal.exe           — same as status, then print help
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	defaultRepoURL = "https://github.com/Gabawaru/Atlas.git"
	defaultBranch  = "main"
	dirName        = "Atlas"
)

func main() {
	args := os.Args[1:]
	cmd := "status"
	if len(args) > 0 {
		cmd = strings.ToLower(args[0])
	}

	root, err := installRoot()
	if err != nil {
		fatal("%v", err)
	}

	switch cmd {
	case "install":
		must(doInstall(root))
	case "update":
		must(doUpdate(root))
	case "start":
		must(doStart(root))
	case "stop":
		must(doStop(root))
	case "status":
		must(doStatus(root))
	case "watch":
		must(doWatch(root))
	case "help", "-h", "--help":
		printHelp()
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n", cmd)
		printHelp()
		os.Exit(2)
	}
}

func printHelp() {
	fmt.Println(`AtlasLocal — run Atlas on Windows without Cursor / "agent worker start"

Usage:
  AtlasLocal.exe install | update | start | stop | status | watch

Install dir (override with ATLAS_HOME):
  %USERPROFILE%\Atlas

Update path (phone → git push → PC):
  AtlasLocal.exe watch
  or Task Scheduler: AtlasLocal.exe update && AtlasLocal.exe start

Prereqs on the PC (not bundled — too large for offline zip):
  Git, Node.js ≥ 20, pnpm 9, Docker Desktop (Postgres 16 + Redis 7)

Secrets: paste PRAGMA_SIGN_API_KEY / RESEND_API_KEY only into %USERPROFILE%\Atlas\.env`)
}

func installRoot() (string, error) {
	if v := strings.TrimSpace(os.Getenv("ATLAS_HOME")); v != "" {
		return filepath.Clean(v), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, dirName), nil
}

func doInstall(root string) error {
	fmt.Printf("Install root: %s\n", root)
	if err := checkPrereqs(false); err != nil {
		fmt.Printf("WARN prereqs: %v\n", err)
	}
	if _, err := os.Stat(filepath.Join(root, ".git")); err == nil {
		fmt.Println("Repo already present — running update…")
		return doUpdate(root)
	}
	if err := os.MkdirAll(filepath.Dir(root), 0o755); err != nil {
		return err
	}
	repo := envOr("ATLAS_REPO_URL", defaultRepoURL)
	branch := envOr("ATLAS_BRANCH", defaultBranch)
	fmt.Printf("Cloning %s (%s)…\n", repo, branch)
	if err := run("", "git", "clone", "--branch", branch, "--single-branch", repo, root); err != nil {
		return err
	}
	return ensureEnv(root)
}

func doUpdate(root string) error {
	if _, err := os.Stat(filepath.Join(root, ".git")); err != nil {
		return fmt.Errorf("no clone at %s — run install first", root)
	}
	branch := envOr("ATLAS_BRANCH", defaultBranch)
	fmt.Printf("Updating %s…\n", root)
	if err := run(root, "git", "fetch", "origin", branch); err != nil {
		return err
	}
	// Preserve local .env; discard other dirty tracked files only if clean strategy requested.
	if err := run(root, "git", "pull", "--ff-only", "origin", branch); err != nil {
		return fmt.Errorf("git pull failed (local commits/conflicts?): %w", err)
	}
	return ensureEnv(root)
}

func doStart(root string) error {
	if _, err := os.Stat(filepath.Join(root, "package.json")); err != nil {
		return fmt.Errorf("Atlas not installed at %s — run install", root)
	}
	if err := checkPrereqs(true); err != nil {
		return err
	}
	if err := ensureEnv(root); err != nil {
		return err
	}
	fmt.Println("Starting Postgres + Redis…")
	if err := run(root, "docker", "compose", "up", "-d"); err != nil {
		return err
	}
	fmt.Println("pnpm install…")
	if err := run(root, "pnpm", "install"); err != nil {
		// Fallback: corepack then retry once
		_ = run(root, "corepack", "enable")
		_ = run(root, "corepack", "prepare", "pnpm@9.15.0", "--activate")
		if err2 := run(root, "pnpm", "install"); err2 != nil {
			return err2
		}
	}
	fmt.Println()
	fmt.Println("Stack ready. In separate terminals (or leave these running):")
	fmt.Printf("  cd %s\n", root)
	fmt.Println("  pnpm demo:smoke")
	fmt.Println("  pnpm dev:api      # :3001")
	fmt.Println("  pnpm dev:client   # :3002")
	fmt.Println("  pnpm dev:admin    # :3000")
	fmt.Println()
	fmt.Println("No Cursor. No \"agent worker start\". Keys stay in .env only.")
	return nil
}

func doStop(root string) error {
	if _, err := os.Stat(filepath.Join(root, "docker-compose.yml")); err != nil {
		return fmt.Errorf("no docker-compose at %s", root)
	}
	fmt.Println("Stopping docker compose…")
	return run(root, "docker", "compose", "stop")
}

func doStatus(root string) error {
	fmt.Printf("OS: %s/%s\n", runtime.GOOS, runtime.GOARCH)
	fmt.Printf("ATLAS_HOME: %s\n", root)
	printTool("git", "git", "version")
	printTool("node", "node", "-v")
	printTool("pnpm", "pnpm", "-v")
	printTool("docker", "docker", "version", "--format", "{{.Server.Version}}")
	if st, err := os.Stat(filepath.Join(root, ".git")); err == nil && st.IsDir() {
		out, err := output(root, "git", "rev-parse", "--short", "HEAD")
		if err == nil {
			fmt.Printf("git HEAD: %s\n", strings.TrimSpace(out))
		}
		br, err := output(root, "git", "rev-parse", "--abbrev-ref", "HEAD")
		if err == nil {
			fmt.Printf("git branch: %s\n", strings.TrimSpace(br))
		}
	} else {
		fmt.Println("git: not cloned yet (run install)")
	}
	envPath := filepath.Join(root, ".env")
	if _, err := os.Stat(envPath); err == nil {
		fmt.Println(".env: present (contents not shown)")
	} else {
		fmt.Println(".env: missing — copy from .env.example and paste keys locally")
	}
	return nil
}

func doWatch(root string) error {
	sec := 300
	if v := strings.TrimSpace(os.Getenv("ATLAS_WATCH_SECONDS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 30 {
			sec = n
		}
	}
	fmt.Printf("Watch mode every %ds — Ctrl+C to stop. Phone push → this PC pulls.\n", sec)
	for {
		if _, err := os.Stat(filepath.Join(root, ".git")); err != nil {
			if err := doInstall(root); err != nil {
				fmt.Fprintf(os.Stderr, "install: %v\n", err)
			}
		} else {
			if err := doUpdate(root); err != nil {
				fmt.Fprintf(os.Stderr, "update: %v\n", err)
			}
		}
		if err := doStart(root); err != nil {
			fmt.Fprintf(os.Stderr, "start: %v\n", err)
		}
		time.Sleep(time.Duration(sec) * time.Second)
	}
}

func ensureEnv(root string) error {
	envPath := filepath.Join(root, ".env")
	if _, err := os.Stat(envPath); err == nil {
		return nil
	}
	candidates := []string{
		filepath.Join(root, ".env.example"),
		filepath.Join(root, "remote-work", ".env.example"),
	}
	for _, src := range candidates {
		if _, err := os.Stat(src); err == nil {
			data, err := os.ReadFile(src)
			if err != nil {
				return err
			}
			if err := os.WriteFile(envPath, data, 0o600); err != nil {
				return err
			}
			fmt.Printf("Created %s from %s — paste secrets locally only.\n", envPath, src)
			return nil
		}
	}
	fmt.Printf("WARN: no .env.example found under %s\n", root)
	return nil
}

func checkPrereqs(strict bool) error {
	var missing []string
	for _, pair := range [][2]string{{"git", "git"}, {"node", "node"}, {"docker", "docker"}} {
		if _, err := exec.LookPath(pair[1]); err != nil {
			missing = append(missing, pair[0])
		}
	}
	if _, err := exec.LookPath("pnpm"); err != nil {
		missing = append(missing, "pnpm (corepack prepare pnpm@9.15.0)")
	}
	if len(missing) == 0 {
		return nil
	}
	msg := fmt.Sprintf("missing tools: %s — install Git, Node≥20, Docker Desktop, then: corepack enable && corepack prepare pnpm@9.15.0 --activate", strings.Join(missing, ", "))
	if strict {
		return fmt.Errorf("%s", msg)
	}
	return fmt.Errorf("%s", msg)
}

func printTool(label, bin string, args ...string) {
	path, err := exec.LookPath(bin)
	if err != nil {
		fmt.Printf("%s: NOT FOUND\n", label)
		return
	}
	out, err := output("", bin, args...)
	if err != nil {
		fmt.Printf("%s: %s (version check failed)\n", label, path)
		return
	}
	fmt.Printf("%s: %s\n", label, strings.TrimSpace(out))
}

func run(dir string, name string, args ...string) error {
	c := exec.Command(name, args...)
	c.Dir = dir
	c.Stdout = os.Stdout
	c.Stderr = os.Stderr
	c.Stdin = os.Stdin
	return c.Run()
}

func output(dir string, name string, args ...string) (string, error) {
	c := exec.Command(name, args...)
	c.Dir = dir
	b, err := c.Output()
	return string(b), err
}

func envOr(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

func must(err error) {
	if err != nil {
		fatal("%v", err)
	}
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "ERROR: "+format+"\n", args...)
	os.Exit(1)
}
