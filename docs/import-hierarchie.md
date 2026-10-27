# Import hiérarchie — format prêt (CSV / JSON)

**Pas** une hiérarchie RH réelle A. Aucun approbateur inventé.

## Arbre éditable (complément)

Saisie directe parent–enfant + multi-affectations (même User, plusieurs postes) :

| Méthode | Path | Rôle |
|---------|------|------|
| `GET` | `/v1/admin/hierarchy?orgId=` | admin, ops, approver — réponse `{ tree }` |
| `GET` | `/v1/admin/hierarchy/staff?orgId=` | admin, ops |
| `POST` | `/v1/admin/hierarchy/nodes` | admin |
| `DELETE` | `/v1/admin/hierarchy/nodes/:id` | admin (cascade sous-arbre) |
| `POST` | `/v1/admin/hierarchy/nodes/:id/assignments` | admin — staff org existant uniquement |
| `PATCH`/`DELETE` | `/v1/admin/hierarchy/assignments/:id` | admin |
| `POST` | `/v1/admin/hierarchy/publish-routing` | admin — `canApprove` → StaffGroup stub (`isStub`) |

Modèle : `HierarchyNode` + `HierarchyAssignment` (N:N). `StaffGroup` / `ApprovalRoutingPolicy` / Policy Guard `NO_APPROVAL_ROUTE` **inchangés**. Import CSV vide → toujours BLOCKED.

## Endpoint import fichier

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
