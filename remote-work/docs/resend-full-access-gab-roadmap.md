# Roadmap Gab — débloquer Resend Domains 401

Updated: 2026-11-02. Zero secrets. Une action par ligne.

1. Ouvre https://resend.com/login et connecte-toi avec le compte Resend Ben / dataperl (celui lié au Domains 401).
2. Ouvre https://resend.com/api-keys .
3. Clique **Create API Key**.
4. Nomme la clé (ex. `atlas-gab`) et choisis la permission **full_access** (pas sending-only).
5. Crée la clé et **copie** la valeur tout de suite (elle ne se réaffiche pas).
6. Sur le PC Gab, ouvre le fichier `C:\Users\gabri\Desktop\Dev\Atlas\.env` (gitignored).
7. Remplace la ligne `RESEND_API_KEY=…` par la **nouvelle** clé (jamais coller la clé ici / Slack / chat).
8. Enregistre le fichier (Ctrl+S).
9. Sur https://resend.com/api-keys , **revoke** l’ancienne clé sending-only / leakée.
10. Réponds « done » ici (sans coller la clé).

Ensuite : le prochain probe Domains (timer) testera automatiquement, ou demander un probe manuel. Attendu : Domains **200**.
