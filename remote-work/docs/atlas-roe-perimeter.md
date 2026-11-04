# Atlas — Authorized Pentest Scope & Rules of Engagement

**Owner:** Pragma / Romain Girardi (Monaco)
**For:** Gab (authorized Atlas operator) — Atlas authorized-pentest tool
**Compiled:** 2026-10-28 (read-only sweep of the fleet `app.yaml` files + canonical docs)
**Status:** Authoritative. This is the complete list of assets Gab is cleared to test. Anything not listed here is OUT of scope.

---

## 1. Authorization

Pragma authorizes Gab (the named Atlas operator) to run security testing (reconnaissance, scanning, vulnerability assessment, OSINT) **only** against the Pragma-owned assets listed in sections 3 and 4 of this document. This authorization covers our own infrastructure. It does **not** extend to any third party.

Any aggressive or mass scan (web or local network), and any OSINT that reaches beyond the listed assets, requires a written go from Ben or Romain for the specific target first.

## 2. Rules of Engagement

- **Test only in-scope assets** (sections 3 and 4). When unsure whether a host is in scope, stop and ask Ben or Romain before touching it.
- **Gated assets (section 5) are OFF until signed off.** Client-brand domains are excluded until the named client gives written authorization, even when we host them on our own tunnel: the DNS/TLS endpoint is ours but the domain identity is the client's, so testing them can implicate the client.
- **No destructive actions:** no denial of service, no data deletion or corruption, no account lockouts, no changes to live client data, no sending of real email/SMS/WhatsApp from our systems during a test.
- **Production care:** throttle scans against production hosts; prefer the `-dev`/preview hosts for aggressive testing. Do not degrade service for real users.
- **Handle findings privately:** keep all findings, captures and credentials in the Atlas repo / private notes, never in public Git, screenshots or third-party services.
- **Stop condition:** if a test causes an outage, data exposure beyond the asset, or anything reaching a third party, stop immediately and notify Ben and Romain.
- **Window:** coordinate heavy scans with Ben/Romain so they are not mistaken for a real attack.

## 3. In scope — Platform / control-plane (Pragma-owned)

| URL | Belongs to |
|---|---|
| pragma-serve.com | Platform apex / branding |
| console.pragma-serve.com | Platform console |
| api.pragma-serve.com | Platform API |
| web.pragma-serve.com | Static sub-path host |
| ai.pragma-cloud.com | AI control plane |
| gtm.pragma-cloud.com | Pragma GTM |
| gtm-pragma-mc.pragma-cloud.com | Pragma.mc GTM |
| pragmamc-crm.pragma-cloud.com | Comptoir / CRM |
| pragmamc.pragma-cloud.com | Pragma.mc site |
| sign.pragma.mc | Pragma Sign |
| drive.pragma.mc | Pragma Drive |
| bc.pragma.mc | Pragma BC |
| equipe.pragma.mc | Pragma Equipe |

## 4. In scope — Pragma-hosted product & staging hosts

Everything under these three patterns is Pragma-owned infrastructure and in scope:

- `*.pragma-cloud.com` — every product/client production host we serve (e.g. `miells.pragma-cloud.com`, `charis.pragma-cloud.com`, `cabinet-nicolas.pragma-cloud.com`, `montblanc.pragma-cloud.com`, `fatima.pragma-cloud.com`, ...).
- `*-dev.pragma-cloud.com` and scaffold preview hosts `2026-..-<slug>-<id>.pragma-cloud.com` — staging/preview (prefer these for aggressive testing).
- `*.pragma-serve.com` and `*.pragma.mc` — platform and Pragma.mc subdomains.

The ~115 live product hosts all follow `https://<slug>.pragma-cloud.com`. The full slug inventory (aadtyn, aegis-sentinel, arcan, biblioscope, cabinet-nicolas, caisse, charis, choeur-du-sud, fatima, helper-church, life, miells, montblanc, naouel, notaria, quorum, scavenge, select-chantier, vigie, ... ) was compiled from the fleet and is reproduced in the Atlas repo README; treat every `<slug>.pragma-cloud.com` we serve as in scope.

## 5. GATED — client-owned / externally-registered brand domains (need sign-off first)

These are registered to / branded for a client even where DNS and TLS ride our Cloudflare tunnel. **Excluded until the named party gives written authorization.**

| Domain | Client / entity | Authorization from |
|---|---|---|
| bussignydunkers.ch | Bussigny Dunkers | the client |
| cepmonaco.com | CEP Monaco | the client |
| lechoeurdusud.com, support.lechoeurdusud.com | Le Choeur du Sud | the client |
| lechoeurgospelstory.fr | Le Choeur du Sud (gospel) | the client |
| www.maison-velanza.com | Velanza | the client |
| mikra.fr | Mikra | the client |
| scriptur.fr, admin.scriptur.fr | Scriptur | confirm Pragma vs client ownership first |
| adj / poppins / sideshift .flash-studio.app | Flash Studio | Flash Studio |
| quirel.com (/decouvrir, /boost) | Quirel (Pragma product) | confirm our registrar before active testing |
| romaingirardi.com | Romain Girardi (personal) | Romain |
| thepromisemonaco.com | The Promise | confirm before adding |

---

*Satisfies the Atlas authorization-scope requirement (set the authorized scope / RoE before any aggressive OSINT or mass scan).*
