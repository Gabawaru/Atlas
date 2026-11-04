# Atlas product loop (Mail + keys)

Updated: 2026-11-02 ~11:47 Europe/Paris. Zero secret values.

> Copie remote-work : liens `internal/…` pointent vers le store projet Atlas, pas ce dépôt public.

## Musk mandate (strict)

1. **Question** every requirement — especially rotation-script era.
2. **Delete** any part or process you can.
3. **Simplify** / optimize.
4. **Accelerate** cycle time.
5. **Automate last.**

Rotation tooling is **scaffolding, not the product.** Keep only what final Atlas needs (working keys + real `atlas-secu.com` outbound). Willing to throw away elaborate rotate helpers if they do not unlock Done (a).

## Quality bar (Ben — final product, réaffirmé)

High quality is non-negotiable for the shipped product:

- Prefer **delete/simplify** over clever ops scaffolding; keep `main` clean (rotate script deleted [#37](https://github.com/Gabawaru/Atlas/pull/37); mail path already **PASS**).
- Docs must match **live evidence** — no stale or false blockers.
- Done **(a)/(b)/(c)/(d)** only when **verified** — no “good enough” stubs; never mark (a) complete on Domains **401** or unverified Sign mint/revoke.
- Hard blockers for keys stay **human**; do **not** invent quality-lowering shortcuts: fake keys, force-merge, secret leaks, or outbound without Gab’s explicit ask.
- Timer rechecks may accelerate discovery; they must not lower the Done bar.

Evidence: [internal/musk-rotate-scaffold-delete.md](../internal/musk-rotate-scaffold-delete.md) · [internal/windows-mail-e2e.md](../internal/windows-mail-e2e.md) · [internal/windows-keys-recheck-1h.md](../internal/windows-keys-recheck-1h.md) · [internal/windows-keys-recheck-musk.md](../internal/windows-keys-recheck-musk.md) · [internal/windows-keys-recheck-goal.md](../internal/windows-keys-recheck-goal.md).

## Product Done

| # | Criterion | Status |
| --- | --- | --- |
| (a) | Sign + Resend keys **rotated/working** (full_access Resend; new Sign partner; **old revoked**) | **NOT DONE** (bar unchanged) — Gab **2026-11-02**: defer rotate / full_access; **use handoff keys as-is**. Domains still expected **401** until Gab asks rotate again. Cloud smoke in flight; Windows `.env` write blocked (worker offline). |
| (b) | Real Atlas outbound from `atlas-secu.com` E2E | **PARTIAL** — API send OK historically; CF **destination** Gmail **verified** 2026-11-02 ([cf-email-routing-check-goal.md](../internal/cf-email-routing-check-goal.md)). Still **no** inbound `*@atlas-secu.com` in Gmail; needs address rules + Gab-OK notify retest. |
| (c) | Keep only useful rotate infra | **DONE** — useful remainder = `.gitignore` `.env.bak.*` + `.env.example` full_access note; script **deleted** [#37](https://github.com/Gabawaru/Atlas/pull/37) (`63b6dce`) |
| (d) | Docs = real state | **DONE** — matches Gab deferral + live evidence ([hard-blocker-park.md](../internal/hard-blocker-park.md)) |

## VERIFY_MAIN (`origin/main@63b6dce`)

| Check | Result |
| --- | --- |
| `scripts/rotate-leaked-api-keys.mjs` | **absent** |
| `.gitignore` `.env.bak.*` | **present** |
| `.env.example` full_access note | **present** (no dead script path) |
| `notify.ts` + `safeNotify` in approvals / missions / control-queue | **present** |

## Milestones

| When | What |
| --- | --- |
| 2026-10-30 | [#35](https://github.com/Gabawaru/Atlas/pull/35) landed rotate script — later Musk-questioned as scaffolding. |
| 2026-10-30 | [#36](https://github.com/Gabawaru/Atlas/pull/36) `safeNotify` callers — mail product path. |
| 2026-10-30 | Windows E2E notify **PASS**; Sign **200** (`X-Api-Key`); Domains **401**. |
| 2026-10-30 | **MERGED** [#37](https://github.com/Gabawaru/Atlas/pull/37) — delete rotate scaffold; script gone from `main` (`63b6dce`). [musk-rotate-scaffold-delete.md](../internal/musk-rotate-scaffold-delete.md) |
| 2026-10-30 | Accelerated Windows probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-musk.md](../internal/windows-keys-recheck-musk.md) |
| 2026-10-30 | Goal recheck — Sign **200**; Domains **401**; lengths unchanged. [windows-keys-recheck-goal.md](../internal/windows-keys-recheck-goal.md) |
| 2026-10-30 | Goal2 quick probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal2.md](../internal/windows-keys-recheck-goal2.md) |
| 2026-10-30 | `VERIFY_MAIN=ok` @ `63b6dce` — (b)(c)(d) DONE; (a) human-blocked. |
| 2026-10-30 | Goal4 Windows probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal4.md](../internal/windows-keys-recheck-goal4.md) |
| 2026-10-30 | Goal5 2h probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal5.md](../internal/windows-keys-recheck-goal5.md) |
| 2026-10-30 | Goal6 2h probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal6.md](../internal/windows-keys-recheck-goal6.md) |
| 2026-10-30 | Goal7 Resend unlock — dashboard → login wall; Domains **401**. [windows-resend-unlock-goal7.md](../internal/windows-resend-unlock-goal7.md) |
| 2026-10-30 | Goal8 2h probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal8.md](../internal/windows-keys-recheck-goal8.md) |
| 2026-10-30 | Goal9 2h probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal9.md](../internal/windows-keys-recheck-goal9.md) |
| 2026-10-30 | Goal10 2h probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal10.md](../internal/windows-keys-recheck-goal10.md) |
| 2026-10-31 | Goal11 2h probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal11.md](../internal/windows-keys-recheck-goal11.md) |
| 2026-10-31 | Goal12 2h probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal12.md](../internal/windows-keys-recheck-goal12.md) |
| 2026-10-31 | Goal13 2h probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal13.md](../internal/windows-keys-recheck-goal13.md) |
| 2026-10-31 | Goal14 probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal14.md](../internal/windows-keys-recheck-goal14.md) |
| 2026-10-31 | Goal15 2h probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal15.md](../internal/windows-keys-recheck-goal15.md) |
| 2026-10-31 | Goal16 probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal16.md](../internal/windows-keys-recheck-goal16.md). Musk filter: Gab manual full_access only; no further dashboard unlock. |
| 2026-10-31 | VERIFY_MAIN refresh — **ok** @ `63b6dce`; (c)(d) green; (b) later PARTIAL. [verify-main-goal16.md](../internal/verify-main-goal16.md) |
| 2026-10-31 | Goal17 probe (post Gab instructions) — Sign **200**; Domains **401**; lengths 47/36 unchanged. [windows-keys-recheck-goal17.md](../internal/windows-keys-recheck-goal17.md) |
| 2026-11-01 | Goal18 2h probe — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal18.md](../internal/windows-keys-recheck-goal18.md) |
| 2026-11-01 | Goal19 after reconnect — Sign **200**; Domains **401**; lengths 47/36. [windows-keys-recheck-goal19.md](../internal/windows-keys-recheck-goal19.md) |
| 2026-11-02 | Gab: ignore rotate for now → use handoff keys. Recheck timers unsubscribed. Cloud smoke **done**: Sign **200**, Domains **401**, `atlas-secu.com` **200**; wiring OK. [handoff-keys-smoke.md](../internal/handoff-keys-smoke.md). Windows `.env` still needs worker online. |
| 2026-11-02 | CF Email Routing destination verify link opened → Gmail destination **verified**. No atlas-secu inbound yet. [cf-email-routing-check-goal.md](../internal/cf-email-routing-check-goal.md) |
| 2026-11-02 | CF API as Gab: **0 zones / 0 destinations** — atlas-secu routing rules not readable; zone owner (Ben/dataperl) required. Windows still offline. Goal parked on humans. [hard-blocker-park.md](../internal/hard-blocker-park.md) |
| 2026-11-02 | Mail `reply_to` audit — already `gabriel@atlas-secu.com` on `safeNotify` path; no PR. [mail-reply-to-audit.md](../internal/mail-reply-to-audit.md) |
| 2026-11-02 | Gab step-by-step tuto published (keys/.env/CF/notify/rotate later). [atlas-gab-tuto-etapes.md](atlas-gab-tuto-etapes.md). Waiting Gab worker + Ben CF + notify OK. |

## Truth (no secrets)

| Probe | Result |
| --- | --- |
| Notify E2E | **PARTIAL** — API `resend` / `isMock=false`; Gmail inbox reception **not found** (2026-10-31) |
| Sign `GET …/signatures` | **200** (`X-Api-Key` → `agent-api.pragma-serve.com`) |
| Resend `GET /domains` | **401** (sending-only; need **full_access**) |
| 30m Sign 401 | Likely **wrong auth** — superseded by 1h **200** |

## HARD BLOCKERS — Done (a) only

Agent cannot mint keys. Windows probes = sibling.

### A) Resend full_access (Gab dashboard)

1. https://resend.com/api-keys → Create → **full_access** → paste **only** local `.env` `RESEND_API_KEY=`.
2. Domains → **200** (today **401**).
3. Revoke old leaked key.

### B) Sign mint/revoke hygiene (Ben + Gab)

List works (**200**). Still need post-leak mint + revoke old for Done (a):

1. Ben mints `atlas-gab` (`signatures:read,signatures:write`) via admin CLI.
2. Gab pastes **only** local `.env` `PRAGMA_SIGN_API_KEY=`.
3. Ben revokes old id.

## Product code kept (not scaffolding)

- `MailModule` + `safeNotify` callers (#36) — real outbound.
- `.env.example` one-line full_access preference — Gab guidance.
- `.gitignore` `.env.bak.*` — cheap ignore.

## Deleted / simplified (Musk)

- **Deleted:** `scripts/rotate-leaked-api-keys.mjs` (~308 lines) — API rotate cannot finish Done (a); duplicates human checklists; ops burden.
- **Simplified:** `.env.example` comment — no script path.

## ERROR=

`VERIFY_MAIN=ok | (c)(d)=DONE | (b)=PARTIAL API-send-ok inbox-missing | (a)=BLOCKED Domains=401 + Sign mint/revoke hygiene | SIGN_LIST=200 | goal16=SIGN200/DOMAINS401 | main=63b6dce`
