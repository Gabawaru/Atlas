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
| Hiérarchie A | Stub `isStub` / seed | Matrice réelle fournie par A (config métier) |
| Contrôles | Présence web + OSINT RDAP apex public in-scope | Modules catalogue, sources OSINT payantes hors MVP |
| Client desktop | Build web + stub Tauri (`bundle.active: false`) | Tauri 2 packagé + signing |
| RoE | Machine-readable + versioning + invalidation signatures | Modèles juridiques cabinet + e-sign réel |
| Signatures | Mock **deux parties** pluggable | Prestataire eIDAS derrière la même interface |
| Connecteurs | Web réel + GitHub **stub** mock OAuth | OAuth GitHub réel (read-only) derrière la même interface |
| Exécution | Worker BullMQ in-process + retry/DLQ/kill | Workers dédiés, HA, priorités |
| Données | RLS Postgres FORCE + `asTenant` (bypass seed/ops) | Chaos tests / rôle DB prod durci |
| Paiements | Plans seed + activate/expire + payment stub | PSP (Stripe-like) hors chemin Policy Guard |
| SAV / tickets | Minimal (états, lien tenant/mission, RBAC support ≠ approver) | SLA, escalade, impersonation journalisée |
| Remédiation findings | Statuts client FICTIFS | Workflow retest / preuves / intégration ticketing |
| Feeds vulns | OSV/NVD/KEV passifs + fixtures CI ; confiance ≠ gravité | Live NVD clé API, couverture élargie, preuves runtime |
| Assistant LLM | Mock + API opt-in env ; plafonds tokens/€ ; journal sans contenu | Broker multi-modèles, budgets fins, redaction avancée |
| Déploiement | Modes hosted/hybrid/local + garde-fous offline (sync journal) | Workers on-prem distincts, sync bidirectionnelle HA |
| Rétention / RGPD | TTL + purge contrôlée + legal hold (hypothèses, pas certif.) | Export/effacement personne, AIPD, archivage froid |
| Versions / ops | Catalogue + maintenance kill-switch + journal | Rolling update cloud UE, canary, alerting |
| Juridique | Docs hors certification | Cadre juridique séparé — pas d’auto-certif |

## Non négociable même en évolution

1. Abonnement ≠ autorisation pentest  
2. Approbation A ≠ autorisation propriétaire  
3. L’IA ne s’auto-accorde pas de droits  
4. Pas d’invention de hiérarchie A réelle dans le code  
5. Pas de scans agressifs / exploitation dans le chemin MVP élargi sans workflow d’autorisation explicite  

## Priorités suggérées (hors cette PR)

1. OIDC + séparation secrets Vault/SOPS  
2. SignatureProvider réel : **Pragma Sign** branché (`PRAGMA_SIGN_API_KEY`) ; mock reste pour CI  
3. Config routage A réelle (fichier / API admin)  
4. Module connecteur authentifié borné  
5. RLS + runbooks prod UE  

Voir aussi `docs/sauvegarde-maj-incidents.md` et le plan produit Project Atlas.
