# Atlas — ce que Gab doit faire (étape par étape)

Mis à jour : 2026-11-02 ~12:00 Europe/Paris. **Aucun secret en clair ici.**

Règle d’or : les clés se collent **uniquement** dans ton fichier `.env` Windows. **Jamais** dans le chat, Slack, PR, ou commit.

Chemin `.env` (machine Gab) :

`C:\Users\gabri\Desktop\Dev\Atlas\.env`

(si le dossier s’appelle `dev` en minuscules, c’est le même fichier)

---

## État déjà OK (tu n’as rien à refaire)

| Élément | Statut |
| --- | --- |
| Site `https://atlas-secu.com` | Live (GitHub Pages) |
| Code Sign (`X-Api-Key` + `agent-api.pragma-serve.com`) | OK sur `main` |
| Code mail (`safeNotify`, `from: ops@…`, `reply_to: gabriel@atlas-secu.com`) | OK sur `main` |
| Destination Gmail Cloudflare | **Vérifiée** (`gabriel.carb.pro@gmail.com`) |
| Smoke Sign avec clé handoff | HTTP **200** |
| Resend Domains (clé envoi seul) | HTTP **401** = normal pour l’instant |

---

## Étape 1 — Ouvrir / créer le `.env`

1. Ouvre l’explorateur → `C:\Users\gabri\Desktop\Dev\Atlas\`
2. Si `.env` n’existe pas : copie `.env.example` → `.env`
3. Ouvre `.env` avec Notepad / VS Code / Cursor

Tu dois avoir (au minimum) ces **noms** de variables (valeurs = collées depuis le handoff Ben, **sans espaces** autour du `=`) :

```
PRAGMA_SIGN_API_KEY=
RESEND_API_KEY=
```

---

## Étape 2 — Coller les 2 clés (handoff Ben)

Dans le message handoff Ben tu as reçu :

1. **Resend** — commence par `re_` → colle sur `RESEND_API_KEY=`
2. **Pragma Sign** — commence par `psk_` → colle sur `PRAGMA_SIGN_API_KEY=`

Exemple de forme (factice) :

```
PRAGMA_SIGN_API_KEY=psk_xxxxxxxx
RESEND_API_KEY=re_xxxxxxxx
```

3. Enregistre (`Ctrl+S`)
4. Vérifie que `.env` n’est **pas** suivi par git (il est dans `.gitignore`)

Pour l’instant Gab a dit qu’on peut **utiliser** ces clés telles quelles (rotation full_access = plus tard).

---

## Étape 3 — Relancer le worker Cursor Windows

Pour que l’agent puisse tester / écrire depuis ta machine :

1. Ouvre un terminal sur le PC
2. Si besoin : `agent login`
3. Puis : `agent worker start`
4. Laisse la fenêtre ouverte

Dis dans le chat : **worker ok** (sans coller de clé).

---

## Étape 4 — (Toi + Ben) Cloudflare Email Routing

**Toi (déjà fait)** : destination Gmail vérifiée.

**Ben** (compte CF qui possède `atlas-secu.com`) doit confirmer les règles :

- `gabriel@atlas-secu.com` → ton Gmail
- `ops@atlas-secu.com` → ton Gmail (et hq/lab si utilisés)

Checklist Ben : [atlas-cf-routing-ben-checklist.md](atlas-cf-routing-ben-checklist.md)  
Ping déjà posté dans Slack `#tous-atlas`.

Quand Ben dit que c’est bon → note-le ici : **cf ok**.

---

## Étape 5 — Test envoi mail (une fois que tu le demandes)

Préférence Atlas : **aucun** envoi sans ton OK explicite.

Quand tu es prêt, écris exactement : **envoie un notify**

L’agent enverra un mail Atlas (`ops@atlas-secu.com`, reply-to `gabriel@…`) et on vérifiera ta boîte Gmail.

---

## Étape 6 — (Plus tard) Rotation « Done (a) »

Seulement quand tu voudras le jalon complet (Domains **200** + anciennes clés révoquées) :

### 6a — Resend `full_access`

1. https://resend.com/login
2. https://resend.com/api-keys → **Create API Key**
3. Permission **full_access** (pas sending-only)
4. Copie la nouvelle clé → remplace `RESEND_API_KEY=` dans `.env` → sauvegarde
5. **Revoke** l’ancienne clé Resend dans le dashboard
6. Dis **done resend** (sans coller la clé)

### 6b — Pragma Sign (Ben)

1. Demande à Ben une **nouvelle** clé partner + révocation de l’ancienne
2. Remplace `PRAGMA_SIGN_API_KEY=` dans `.env`
3. Dis **done sign** (sans coller la clé)

Détail Resend : [resend-full-access-gab-roadmap.md](resend-full-access-gab-roadmap.md)

---

## Étape 7 — Pages / binaire (si pas déjà fait)

1. Repo : `github.com/Gabawaru/Atlas` — `index.html` + `CNAME` déjà sur `main` / site live
2. Settings → Pages → branche `main` / root, custom domain `atlas-secu.com`, Enforce HTTPS
3. Binaire : GitHub Release → lien `…/releases/latest/download/<fichier>` sur le bouton de la page
4. Si GitHub demande un TXT `_github-pages-challenge` → envoie-le à Ben (pas une clé API)

---

## Ce que tu ne dois **jamais** faire

- Coller `re_…` ou `psk_…` dans le chat / Slack
- Committer `.env`
- Scanner hors RoE (`*.pragma-cloud.com`, `*.pragma-serve.com`, `*.pragma.mc`) sans feu vert Ben/Romain

---

## Sans accès Windows (maintenant)

Tu peux quand même :

1. Relancer Ben pour les règles CF (Slack `#tous-atlas` déjà pingé)
2. Vérifier GitHub Pages / Releases depuis un navigateur (téléphone OK)
3. (Optionnel) Créer une clé Resend `full_access` dans le dashboard — **stocke-la hors chat** pour la coller dans `.env` dès que Windows revient

Tu ne peux pas : écrire `.env`, lancer `agent worker start`, ni le retest local Sign/mail.

---

## Mini checklist « je suis à jour »

- [ ] Clés collées dans `.env` uniquement
- [ ] `agent worker start` tourne
- [ ] Ben a confirmé les règles CF (`cf ok`)
- [ ] Tu as dit **envoie un notify** et tu as vu le mail dans Gmail
- [ ] (Optionnel plus tard) Resend full_access + Sign rotate + revoke
