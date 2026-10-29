# Jalon — une course passive autorisée (process)

**Acceptation produit (figée) :** un non-spécialiste lance **un** contrôle web **passif** in-scope, seulement avec autorisation écrite + Policy Guard, et voit des résultats unifiés.

Ce n’est **pas** : plateforme billing/SAV/vuln-live complète, OIDC, eIDAS, cloud UE, pack agressif, preuve VM Playwright.

## Checklist ~10 minutes (humain)

1. **Comptes locaux** (pas de faux SSO)  
   - [ ] Owner tenant + 2 cofondateurs/approvers réels saisis dans l’arbre A (admin)  
   - [ ] Mot de passe hors seed partagé si env non-local  

2. **Cible**  
   - [ ] Actif in-scope explicite (FQDN public) — pas d’IP privée / metadata  
   - [ ] Exclusions RoE renseignées si besoin  

3. **Autorisation écrite**  
   - [ ] Modèle FR + checklist Monaco remplis pour **cette** cible  
   - [ ] **TODO (humain) :** signature réelle via **Pragma Sign** (`PRAGMA_SIGN_API_KEY` + enveloppe `status=signed`).  
   - [ ] En démo locale sans clé : SignatureProvider **mock** / `ATLAS_CHAT_SIGNATURE_STUB` (chat ≠ countersign owner) ; `ATLAS_AUTHZ=signed` local/dev only 

4. **Exécution**  
   - [ ] Client : CTA Scanner → readiness → execute  
   - [ ] Policy Guard `ALLOW` → job passif → résultats unifiés  

5. **Preuve Gabriel (Mac / client)**  
   - [ ] **TODO (Gabriel) :** ouvrir le client (Vite OK ; `.dmg` Tauri signé **non** requis) et confirmer CTA + un run  
   - [ ] Ne pas bloquer sur capture agent VM / Playwright  

## Stop condition

Quand l’étape 4+5 réussit **une fois** sur une cible réellement autorisée → seulement alors rouvrir OIDC / Pragma Sign / cloud UE.

## Non-actions

- Ne pas inventer hiérarchie / approbateurs.  
- Ne pas traiter billing/SAV/retention comme gate merge.  
- Ne pas fusionner « chat stub signed » et « autorisation propriétaire ».
