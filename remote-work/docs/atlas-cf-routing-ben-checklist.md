# Atlas — Cloudflare Email Routing (zone owner)

Updated: 2026-11-02 ~11:53 Europe/Paris. Zero secrets.

For **Benjamin / dataperl** Cloudflare account that owns `atlas-secu.com`. Gab’s CF login has **no** zone and cannot fix this.

## Already done

- Destination `gabriel.carb.pro@gmail.com` → **verified** (2026-11-02)
- Outbound Resend from `*@atlas-secu.com` works at API level (sending-only key OK for send)
- Site `https://atlas-secu.com` live (GitHub Pages)

## Still needed on the zone

1. Email Routing **enabled** for `atlas-secu.com`
2. Rules (or catch-all) so these land in verified Gmail:
   - `gabriel@atlas-secu.com`
   - `ops@atlas-secu.com` (and `hq` / `lab` aliases if used)
3. Confirm MX / Email Routing DNS still healthy after Pages CNAME

## Then tell Gab

« règles CF ok » → Gab asks the agent for one MailModule notify retest → prove inbox.

## Not Gab’s CF

Agent probed Gab accounts (`Gabriel.carb.pro@gmail.com’s Account`, `Vanilla Hen`): 0 zones, 0 destinations. Routing lives on the Ben/dataperl account named in the verify email.
