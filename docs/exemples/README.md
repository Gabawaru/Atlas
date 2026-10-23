# Exemples de rapports — FICTIF

Fichiers générés par `apps/api/scripts/generate-exemple-rapport.ts` (même pipeline que les exports runtime).

| Fichier | Format |
|---------|--------|
| `rapport-presence-web-fictif.json` | JSON |
| `rapport-presence-web-fictif.csv` | CSV |
| `rapport-presence-web-fictif.pdf` | PDF |

**Marqueur :** `synthetic: true` / bannière FICTIF. Ne constitue pas une preuve juridique ni un pentest réel.

Régénérer :

```bash
pnpm --filter @atlas/api exec tsx scripts/generate-exemple-rapport.ts
```

Hashes (sha256) de cette génération :

```json
{
  "json": "265fa5e5153e572b326e7a6906783ea7128fb5de1b5975c88836f1471a742649",
  "csv": "695e3f581bc8159400c518f3dd3993020f4d737fccfcba4bd9e3d40a1163a1f1",
  "pdf": "d1f887c1c51a1f62699bf65cfe922f885e19d9831d90819e920ab5489409b10a"
}
```
