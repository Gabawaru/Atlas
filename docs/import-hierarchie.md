# Import hiérarchie — format prêt (CSV / JSON)

**Pas** une hiérarchie RH réelle A. Aucun approbateur inventé.

## Endpoint

`POST /v1/admin/routing/import` (rôle **admin**)

```json
{
  "orgId": "<org>",
  "format": "csv",
  "content": "email,role\napprover@a.atlas.local,approver\n",
  "tenantId": "<optionnel>"
}
```

## CSV

```csv
email,role
approver@a.atlas.local,approver
```

Commentaires `#` ignorés. Séparateurs `,` `;` ou tab.

## JSON

```json
{ "approvers": [{ "email": "approver@a.atlas.local", "role": "approver" }] }
```

ou tableau `["approver@a.atlas.local"]`.

## Règles

| Cas | Effet |
|-----|--------|
| Fichier **vide** / `[]` | `imported: 0`, **aucune** route — missions **réelles** restent `BLOCKED` |
| Emails inconnus | Listés `unknownEmails` — **pas** de création de comptes |
| Emails = staff `approver` existants | Route `isStub` créée (format prêt, pas org chart certifiée) |

Démo rapide sans fichier : `POST /v1/admin/routing/import-stub` (stub explicite).
