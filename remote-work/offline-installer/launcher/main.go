// AtlasLocal — cross-platform launcher for Atlas WITHOUT Cursor / agent worker.
//
// Build (from launcher/):
//
//	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o ../bin/AtlasLocal.exe .
//	CGO_ENABLED=0 go build -ldflags="-s -w" -o ../bin/AtlasLocal .
//
// Commands:
//
//	AtlasLocal install|update|start|stop|status|watch [seconds]
//
// Watch auto-update (Musk-minimal): fetch → compare HEAD vs origin/<branch> → pull → pnpm → restart.
package main

import (
	"fmt"
	"net"
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
	stateDirName   = ".atlaslocal"
)

// Managed local services restarted after a successful pull.
var defaultServices = []serviceSpec{
	{name: "api", args: []string{"pnpm", "dev:api"}},
	{name: "client", args: []string{"pnpm", "dev:client"}},
}

type serviceSpec struct {
	name string
	args []string
}

func main() {
	args := os.Args[1:]
	cmd := "status"
	if len(args) > 0 {
		cmd = strings.ToLower(args[0])
	}
	rest := []string{}
	if len(args) > 1 {
		rest = args[1:]
	}

	root, err := installRoot()
	if err != nil {
		fatal("%v", err)
	}

	// Darwin/Linuxbrew: keg-only node@20 often off PATH for GUI /start-api children.
	prependHomebrewNodePath()

	switch cmd {
	case "install":
		must(doInstall(root))
	case "update":
		must(doUpdate(root))
	case "start":
		must(doStart(root, true))
	case "stop":
		must(doStop(root))
	case "status":
		must(doStatus(root))
	case "watch":
		must(doWatch(root, rest))
	case "help", "-h", "--help":
		printHelp()
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n", cmd)
		printHelp()
		os.Exit(2)
	}
}

func printHelp() {
	bin := "AtlasLocal"
	if runtime.GOOS == "windows" {
		bin = "AtlasLocal.exe"
	}
	homeHint := "~/Atlas"
	if runtime.GOOS == "windows" {
		homeHint = `%USERPROFILE%\Atlas`
	}
	fmt.Printf(`AtlasLocal — run Atlas on %s/%s without Cursor / "agent worker start"

Usage:
  %s install | update | start | stop | status | watch [seconds]

Install dir (override with ATLAS_HOME):
  %s

Auto-update (git push → machine):
  %s watch          # poll every ATLAS_WATCH_SECONDS (default 300)
  %s watch 60       # poll every 60s (min 30)
  Windows Task Scheduler: Register-AtlasWatchTask.ps1

Watch loop: fetch → compare → pull only if origin advanced → pnpm install → restart api+client.

Env:
  ATLAS_HOME            install root (default %s)
  ATLAS_REPO_URL        clone URL (default https://github.com/Gabawaru/Atlas.git)
  ATLAS_BRANCH          branch to track (default main)
  ATLAS_WATCH_SECONDS   watch poll interval when no [seconds] arg (default 300, min 30)
  ATLAS_SERVICES        comma list: api,client (default both). Empty = docker/pnpm only

Prereqs (not bundled):
  Git, Node.js ≥ 20, pnpm 9, Postgres 16 + Redis 7
  Preferred: Docker (Docker Desktop on Windows/macOS, Engine on Linux)
  Fallback: native Postgres/Redis already listening on localhost (see scripts/unix/)

Secrets: paste PRAGMA_SIGN_API_KEY / RESEND_API_KEY only into %s/.env
`, runtime.GOOS, runtime.GOARCH, bin, homeHint, bin, bin, homeHint, homeHint)
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

func stateDir(root string) string {
	return filepath.Join(root, stateDirName)
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
	fmt.Printf("Updating %s (origin/%s)…\n", root, branch)
	if err := run(root, "git", "fetch", "origin", branch); err != nil {
		return err
	}
	// Preserve local .env; ff-only refuses divergent local commits.
	if err := run(root, "git", "pull", "--ff-only", "origin", branch); err != nil {
		return fmt.Errorf("git pull failed (local commits/conflicts?): %w", err)
	}
	return ensureEnv(root)
}

// upstreamChanged fetches origin/<branch> and reports whether remote SHA ≠ local HEAD.
func upstreamChanged(root string) (changed bool, local, remote string, err error) {
	branch := envOr("ATLAS_BRANCH", defaultBranch)
	if err = runQuiet(root, "git", "fetch", "origin", branch); err != nil {
		return false, "", "", err
	}
	local, err = output(root, "git", "rev-parse", "HEAD")
	if err != nil {
		return false, "", "", err
	}
	remote, err = output(root, "git", "rev-parse", "origin/"+branch)
	if err != nil {
		return false, strings.TrimSpace(local), "", err
	}
	local = strings.TrimSpace(local)
	remote = strings.TrimSpace(remote)
	return local != remote, local, remote, nil
}

func doStart(root string, startSvcs bool) error {
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
	if err := ensureDataPlane(root); err != nil {
		return err
	}
	fmt.Println("pnpm install…")
	if err := run(root, "pnpm", "install"); err != nil {
		_ = run(root, "corepack", "enable")
		_ = run(root, "corepack", "prepare", "pnpm@9.15.0", "--activate")
		if err2 := run(root, "pnpm", "install"); err2 != nil {
			return err2
		}
	}
	_ = ensureAPIEnv(root)
	_ = buildSharedPackages(root)
	if startSvcs {
		if err := restartServices(root); err != nil {
			return err
		}
	} else {
		fmt.Println()
		fmt.Println("Stack deps ready. Start services with: AtlasLocal start")
		fmt.Printf("  or manually: cd %s && pnpm dev:api / pnpm dev:client\n", root)
	}
	fmt.Println("No Cursor. No \"agent worker start\". Keys stay in .env only.")
	return nil
}

func doStop(root string) error {
	stopServices(root)
	if _, err := os.Stat(filepath.Join(root, "docker-compose.yml")); err != nil {
		return fmt.Errorf("no docker-compose at %s", root)
	}
	if _, err := exec.LookPath("docker"); err != nil {
		fmt.Println("Docker not on PATH — left native Postgres/Redis alone.")
		return nil
	}
	fmt.Println("Stopping docker compose…")
	if err := run(root, "docker", "compose", "stop"); err != nil {
		fmt.Printf("WARN: docker compose stop: %v\n", err)
	}
	return nil
}

// ensureDataPlane brings up Postgres+Redis via docker compose, or accepts a
// native localhost data plane already listening (Linux/macOS without Docker).
func ensureDataPlane(root string) error {
	if _, err := exec.LookPath("docker"); err == nil {
		if err := run(root, "docker", "compose", "up", "-d"); err == nil {
			return nil
		} else if localhostDataPlaneOK() {
			fmt.Printf("WARN: docker compose failed (%v) — Postgres/Redis already reachable on localhost, continuing.\n", err)
			return nil
		} else {
			return fmt.Errorf("docker compose up failed and localhost:5432/6379 unreachable: %w", err)
		}
	}
	if localhostDataPlaneOK() {
		fmt.Println("Docker not found — using native Postgres/Redis on localhost.")
		return nil
	}
	return fmt.Errorf("need Docker (compose) or native Postgres:5432 + Redis:6379 — see scripts/unix/install-atlas-prereqs.sh or scripts/windows/")
}

func localhostDataPlaneOK() bool {
	return tcpOpen("127.0.0.1:5432") && tcpOpen("127.0.0.1:6379")
}

func tcpOpen(addr string) bool {
	c, err := net.DialTimeout("tcp", addr, 800*time.Millisecond)
	if err != nil {
		return false
	}
	_ = c.Close()
	return true
}

func ensureAPIEnv(root string) error {
	src := filepath.Join(root, ".env")
	if _, err := os.Stat(src); err != nil {
		return err
	}
	apiEnv := filepath.Join(root, "apps", "api", ".env")
	if _, err := os.Stat(apiEnv); err == nil {
		return nil
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(apiEnv), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(apiEnv, data, 0o600); err != nil {
		return err
	}
	fmt.Printf("Synced %s for Prisma CLI.\n", apiEnv)
	return nil
}

func buildSharedPackages(root string) error {
	fmt.Println("Building @atlas/shared + @atlas/policy-guard…")
	_ = run(root, "pnpm", "--filter", "@atlas/shared", "build")
	_ = run(root, "pnpm", "--filter", "@atlas/policy-guard", "build")
	_ = run(root, "pnpm", "db:generate")
	return nil
}

func doStatus(root string) error {
	fmt.Printf("OS: %s/%s\n", runtime.GOOS, runtime.GOARCH)
	fmt.Printf("ATLAS_HOME: %s\n", root)
	fmt.Printf("ATLAS_BRANCH: %s\n", envOr("ATLAS_BRANCH", defaultBranch))
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
		branch := envOr("ATLAS_BRANCH", defaultBranch)
		rem, err := output(root, "git", "rev-parse", "--short", "origin/"+branch)
		if err == nil {
			fmt.Printf("origin/%s: %s\n", branch, strings.TrimSpace(rem))
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
	for _, svc := range configuredServices() {
		pid, alive := serviceStatus(root, svc.name)
		if pid == 0 {
			fmt.Printf("service %s: not started\n", svc.name)
		} else if alive {
			fmt.Printf("service %s: running (pid %d)\n", svc.name, pid)
		} else {
			fmt.Printf("service %s: stale pid %d (not running)\n", svc.name, pid)
		}
	}
	return nil
}

func doWatch(root string, rest []string) error {
	sec := watchInterval(rest)
	branch := envOr("ATLAS_BRANCH", defaultBranch)
	fmt.Printf("Watch mode every %ds on origin/%s — Ctrl+C to stop.\n", sec, branch)
	fmt.Println("Loop: fetch → compare → pull if ahead → rebuild → restart api+client.")

	booted := false
	for {
		if _, err := os.Stat(filepath.Join(root, ".git")); err != nil {
			fmt.Println("No clone — install…")
			if err := doInstall(root); err != nil {
				fmt.Fprintf(os.Stderr, "install: %v\n", err)
				time.Sleep(time.Duration(sec) * time.Second)
				continue
			}
			if err := doStart(root, true); err != nil {
				fmt.Fprintf(os.Stderr, "start: %v\n", err)
			} else {
				booted = true
			}
			time.Sleep(time.Duration(sec) * time.Second)
			continue
		}

		changed, local, remote, err := upstreamChanged(root)
		if err != nil {
			fmt.Fprintf(os.Stderr, "fetch/compare: %v\n", err)
			time.Sleep(time.Duration(sec) * time.Second)
			continue
		}

		shortLocal := shortSHA(local)
		shortRemote := shortSHA(remote)

		if !booted {
			fmt.Printf("First boot at %s — ensuring stack + services…\n", shortLocal)
			if err := doStart(root, true); err != nil {
				fmt.Fprintf(os.Stderr, "start: %v\n", err)
			} else {
				booted = true
			}
		} else if changed {
			fmt.Printf("Upstream advanced %s → %s — pulling…\n", shortLocal, shortRemote)
			if err := doUpdate(root); err != nil {
				fmt.Fprintf(os.Stderr, "update: %v\n", err)
			} else if err := doStart(root, true); err != nil {
				fmt.Fprintf(os.Stderr, "restart: %v\n", err)
			} else {
				fmt.Println("Updated and restarted.")
			}
		} else {
			fmt.Printf("Up to date (%s). Checking services…\n", shortLocal)
			ensureServices(root)
		}

		time.Sleep(time.Duration(sec) * time.Second)
	}
}

func watchInterval(rest []string) int {
	sec := 300
	if v := strings.TrimSpace(os.Getenv("ATLAS_WATCH_SECONDS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 30 {
			sec = n
		}
	}
	if len(rest) > 0 {
		if n, err := strconv.Atoi(strings.TrimSpace(rest[0])); err == nil && n >= 30 {
			sec = n
		}
	}
	return sec
}

func configuredServices() []serviceSpec {
	raw := strings.TrimSpace(os.Getenv("ATLAS_SERVICES"))
	if raw == "" {
		// Unset → default both. Explicit empty via ATLAS_SERVICES=- means none.
		if _, set := os.LookupEnv("ATLAS_SERVICES"); set {
			return nil
		}
		return defaultServices
	}
	if raw == "-" || raw == "none" {
		return nil
	}
	want := map[string]bool{}
	for _, p := range strings.Split(raw, ",") {
		want[strings.ToLower(strings.TrimSpace(p))] = true
	}
	var out []serviceSpec
	for _, svc := range defaultServices {
		if want[svc.name] {
			out = append(out, svc)
		}
	}
	return out
}

func restartServices(root string) error {
	svcs := configuredServices()
	if len(svcs) == 0 {
		fmt.Println("ATLAS_SERVICES empty — skipping api/client process manage.")
		return nil
	}
	stopServices(root)
	for _, svc := range svcs {
		if err := startService(root, svc); err != nil {
			return fmt.Errorf("start %s: %w", svc.name, err)
		}
	}
	return nil
}

func ensureServices(root string) {
	for _, svc := range configuredServices() {
		pid, alive := serviceStatus(root, svc.name)
		if alive {
			continue
		}
		if pid != 0 {
			fmt.Printf("service %s dead — restarting…\n", svc.name)
		} else {
			fmt.Printf("service %s missing — starting…\n", svc.name)
		}
		if err := startService(root, svc); err != nil {
			fmt.Fprintf(os.Stderr, "service %s: %v\n", svc.name, err)
		}
	}
}

func stopServices(root string) {
	// Always clear known pid files so orphans do not survive ATLAS_SERVICES changes.
	for _, svc := range defaultServices {
		stopService(root, svc.name)
	}
}

func pidFile(root, name string) string {
	return filepath.Join(stateDir(root), name+".pid")
}

func logFile(root, name string) string {
	return filepath.Join(stateDir(root), name+".log")
}

func serviceStatus(root, name string) (pid int, alive bool) {
	b, err := os.ReadFile(pidFile(root, name))
	if err != nil {
		return 0, false
	}
	pid, err = strconv.Atoi(strings.TrimSpace(string(b)))
	if err != nil || pid <= 0 {
		return 0, false
	}
	return pid, processAlive(pid)
}

func stopService(root, name string) {
	pid, alive := serviceStatus(root, name)
	_ = os.Remove(pidFile(root, name))
	if pid == 0 {
		return
	}
	if !alive {
		return
	}
	fmt.Printf("Stopping %s (pid %d)…\n", name, pid)
	killProcessTree(pid)
}

func startService(root string, svc serviceSpec) error {
	if err := os.MkdirAll(stateDir(root), 0o755); err != nil {
		return err
	}
	stopService(root, svc.name)

	lf, err := os.OpenFile(logFile(root, svc.name), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}

	cmd := exec.Command(svc.args[0], svc.args[1:]...)
	cmd.Dir = root
	cmd.Stdout = lf
	cmd.Stderr = lf
	cmd.Stdin = nil
	// Inject root .env into child (ATLAS_AUTHZ, CORS, VITE_*, DB…) without printing secrets.
	// Existing process env wins over .env so operators can override from the shell.
	cmd.Env = mergeDotEnv(os.Environ(), filepath.Join(root, ".env"))
	setDetached(cmd)

	if err := cmd.Start(); err != nil {
		_ = lf.Close()
		return err
	}
	pid := cmd.Process.Pid
	if err := os.WriteFile(pidFile(root, svc.name), []byte(strconv.Itoa(pid)+"\n"), 0o644); err != nil {
		_ = cmd.Process.Kill()
		_ = lf.Close()
		return err
	}
	// Reap so we don't leave zombies; log file stays open via inherited fd.
	go func() {
		_ = cmd.Wait()
		_ = lf.Close()
	}()
	fmt.Printf("Started %s (pid %d) — log %s\n", svc.name, pid, logFile(root, svc.name))
	return nil
}

// mergeDotEnv returns base environ with KEY=VALUE from .env filled only when KEY is unset.
// Skips comments/blank lines. Does not log values. Missing file → base unchanged.
func mergeDotEnv(base []string, envPath string) []string {
	data, err := os.ReadFile(envPath)
	if err != nil {
		return base
	}
	have := map[string]bool{}
	for _, e := range base {
		if i := strings.IndexByte(e, '='); i > 0 {
			have[e[:i]] = true
		}
	}
	out := append([]string{}, base...)
	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(strings.TrimSuffix(raw, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.IndexByte(line, '=')
		if eq <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		if key == "" || have[key] {
			continue
		}
		val := strings.TrimSpace(line[eq+1:])
		if len(val) >= 2 {
			if (val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'') {
				val = val[1 : len(val)-1]
			}
		}
		out = append(out, key+"="+val)
		have[key] = true
	}
	return out
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
	// Docker is preferred but optional when native Postgres/Redis already listen.
	if localhostDataPlaneOK() {
		var kept []string
		for _, m := range missing {
			if m == "docker" {
				continue
			}
			kept = append(kept, m)
		}
		missing = kept
	}
	if len(missing) == 0 {
		return nil
	}
	_ = strict
	hint := "scripts/unix/install-atlas-prereqs.sh (Linux/macOS) or scripts/windows/Install-AtlasPrereqs.ps1"
	msg := fmt.Sprintf("missing tools: %s — install Git, Node≥20, pnpm 9, Docker or native Postgres/Redis; then %s", strings.Join(missing, ", "), hint)
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

func runQuiet(dir string, name string, args ...string) error {
	c := exec.Command(name, args...)
	c.Dir = dir
	c.Stdout = nil
	c.Stderr = os.Stderr
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

func shortSHA(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 7 {
		return s[:7]
	}
	return s
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
