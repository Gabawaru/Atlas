# Build `Atlas.exe`

Produit depuis le stub desktop existant `apps/client/src-tauri` (pas une nouvelle app).

```bash
# Linux agent with mingw
rustup target add x86_64-pc-windows-gnu
# linker: x86_64-w64-mingw32-gcc (package gcc-mingw-w64-x86-64)

cargo build --release \
  --manifest-path apps/client/src-tauri/Cargo.toml \
  --target x86_64-pc-windows-gnu

# Artifact:
# apps/client/src-tauri/target/x86_64-pc-windows-gnu/release/atlas-client-stub.exe
# Copied to remote-work/bin/Atlas.exe
```

Message-only : pas de webview, pas de secrets embarqués, pas de contrôles.
