# Atlas — handoff founders (atlas-secu.com)

**Source:** message Ben/Romain + 3 attachments (2026-10-29)  
**Store copies:** [RoE](./atlas-pentest-scope-roe.md) · [Tutoriels](./atlas-tutoriels-gab.md) (secrets redacted) · [Pragma Sign](./pragma-sign-atlas-integration.md)

## Essentials (no secrets)

1. **Site:** GitHub Pages on `Gabawaru/Atlas` → custom domain **atlas-secu.com** (DNS already pointed). One-time: root `index.html`, Pages = `main` / root, Enforce HTTPS. Deploy = `git push`.
2. **Binary:** GitHub Releases; link `/releases/latest/download/<file>`. Domain lock TXT `_github-pages-challenge-*` → send to founders for DNS.
3. **Mail:** Resend (send) + Cloudflare Email Routing (receive → `gabriel.carb.pro@gmail.com`). Verify Cloudflare email first. Addresses on `hq` / `ops` / `lab` + apex; use `reply_to: gabriel@atlas-secu.com` for subdomain sends.
4. **Pragma Sign:** API `https://agent-api.pragma-serve.com` with `X-Api-Key` + explicit `User-Agent`. Frontend `sign.pragma.mc` is not the API. Key lives in env / secret store — **not** in repo or chat.
5. **RoE:** only `*.pragma-cloud.com`, `*.pragma-serve.com`, `*.pragma.mc` (+ listed platform hosts). Client brand domains gated. Aggressive / out-of-list needs Ben/Romain written go.

## Security note

Plaintext Resend + Pragma Sign keys appeared in the chat/tuto (**again 2026-11-02** — treat as compromised). Rotate/revoke immediately; never commit keys to Atlas; use env vars only; never re-paste into chat.
