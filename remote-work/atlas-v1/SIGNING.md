# Windows code signing plan (Atlas-Setup.exe + Atlas.exe)

**Status:** unsigned today. SmartScreen / “éditeur inconnu” is expected until a real org certificate is purchased and wired. This doc is the plan only — **no certs, PFXs, or secrets live in the repo.**

## Why

| Artifact | Today | Real distribution need |
|----------|--------|-------------------------|
| `Atlas-Setup.exe` (NSIS) | Unsigned PE | Authenticode on the Setup |
| `payload/Atlas.exe` | Unsigned PE | Authenticode on the shell |
| `AtlasLocal.exe` | Unsigned PE | Same chain (optional but recommended) |

Without Authenticode, Windows shows publisher warnings; enterprise allow-lists often block the download.

## What we will **not** do

- Commit `.pfx` / `.p12` / passwords / USB token PINs
- Invent a self-signed “Pragma” cert and pretend it is trusted
- Ship a test cert as production signing
- Bypass SmartScreen with fake reputation tricks

## Recommended path (org OV/EV)

1. **Buy** an organization Authenticode certificate (OV minimum; EV preferred for faster reputation) issued to the legal entity that publishes Atlas (Pragma / Gabawaru — confirm exact subject with founders).
2. **Store** the private key outside git:
   - Preferred: hardware token / HSM, or
   - CI: GitHub Actions **encrypted secret** + optional OIDC → cloud KMS (Azure Key Vault / AWS KMS / Google Cloud KMS) holding the key.
3. **Sign at build time** (Windows runner or `osslsigncode` on Linux with the unlocked key material):
   - Sign `payload/Atlas.exe` (and `AtlasLocal.exe`) **before** NSIS packs them.
   - Sign `Atlas-Setup.exe` **after** `makensis`.
   - Timestamp with a public TSA (e.g. DigiCert / Sectigo) so signatures remain valid after cert expiry.
4. **Verify** before publish:
   ```text
   Get-AuthenticodeSignature .\Atlas-Setup.exe
   Get-AuthenticodeSignature .\Atlas.exe
   ```
   Status must be `Valid`; Publisher matches the purchased subject.
5. **Publish the same signed bytes** to GitHub Release `vX.Y.Z` **and** `atlas-secu-pages` `/Atlas-Setup.exe` (see offline-installer README version lock).

## CI sketch (when secrets exist)

Workflow inputs (names only — values never in git):

| Secret / var | Role |
|--------------|------|
| `WINDOWS_CERT_PFX` (or KMS ref) | Signing material — not committed |
| `WINDOWS_CERT_PASSWORD` | PFX unlock if applicable |
| `WINDOWS_CERT_SUBJECT` | Expected publisher string for a verify step |

Job shape: build PE → sign inner exes → `makensis` → sign Setup → checksum → `gh release upload` → Pages copy.

Until those secrets are provisioned by a human with purchasing authority, release workflow stays **unsigned** and this file stays the contract.

## Interim (unsigned) messaging

- Site / README: link https://atlas-secu.com — warn that Windows may prompt; run only builds from that domain or GitHub Releases.
- Do not claim “signed” / “SmartScreen clean” in marketing copy.

## Owners

| Step | Who |
|------|-----|
| Purchase cert + legal subject | Founders (Ben / Romain) |
| Store secrets in GitHub / KMS | Ops with repo admin |
| Wire sign steps in CI | Engineering (this tree) |
| First signed `vX.Y.Z` cut | Engineering + verify on Gab Windows |
