# Limites actuelles et évolutions possibles — Atlas MVP

Document honnête : ce qui **est** livré vs ce qui **n’est pas** le produit final.

## Livré et vérifiable

- Parcours démo synthétique → rapport (Policy Guard + BullMQ + exports)
- Blocages : sans owner auth, sans approbateur (mission réelle), hors scope, expiration/révocation
- RBAC staff séparé (admin / support / billing / ops / approver)
- Journal audit chaîné + `verify_chain`
- Docs install + suite `pnpm test:acceptance`

## Limites assumées

| Domaine | Limite MVP | Évolution typique |
|---------|------------|-------------------|
| Identité | Auth locale seedée | OIDC (Keycloak / Auth0) |
| Signatures | `MockSignatureProvider` | Prestataire e-sign EU pluggable |
| Hiérarchie A | Stub `isStub` / seed | Matrice réelle fournie par A (config métier) |
| Contrôles | Présence web passive seule | Connecteur auth lecture, modules catalogue versionné |
| Exécution | 1 worker BullMQ in-process API | Workers dédiés, HA, priorités |
| Données | Isolation logique `tenantId` | RLS Postgres + tests chaos |
| Client desktop | Stub Tauri | Shell Tauri 2 + coffre OS |
| Paiements | Plan seedé | PSP (Stripe-like) hors chemin Policy Guard |
| Feeds vulns | Absents | NVD/KEV/OSV avec licences documentées |
| Juridique | Docs hors certification | Cadre juridique séparé — pas d’auto-certif |

## Non négociable même en évolution

1. Abonnement ≠ autorisation pentest  
2. Approbation A ≠ autorisation propriétaire  
3. L’IA ne s’auto-accorde pas de droits  
4. Pas d’invention de hiérarchie A réelle dans le code  
5. Pas de scans agressifs / exploitation dans le chemin MVP élargi sans workflow d’autorisation explicite  

## Priorités suggérées (hors cette PR)

1. OIDC + séparation secrets Vault/SOPS  
2. SignatureProvider réel (Yousign / DocuSign / …) derrière la même interface  
3. Config routage A réelle (fichier / API admin)  
4. Module connecteur authentifié borné  
5. RLS + runbooks prod UE  

Voir aussi `docs/sauvegarde-maj-incidents.md` et le plan produit Project Atlas.
