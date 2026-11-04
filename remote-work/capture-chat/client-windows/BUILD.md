# Build `capture-chat.exe`

From this directory (Linux/macOS CI or Gab’s machine with Go ≥ 1.22):

```bash
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o capture-chat.exe .
```

Or from the package root:

```bash
bash scripts/build-windows-exe.sh
```

Output: `client-windows/capture-chat.exe` (PE32+ x86_64).

Copy `capture-chat.env.example` → `capture-chat.env` next to the exe and set URL + token.
