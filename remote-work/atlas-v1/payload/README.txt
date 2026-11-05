Atlas v1
========
Assistant de pentest autorise (Pragma / entreprise A).

Installed by Atlas-Setup.exe:
  - Atlas.exe — ouvre la plateforme locale (bouton Scan)
  - tools\Install-AtlasPrereqs.* — prerequis hote (Node/pnpm/Docker) pour le monorepo

Workflow Scan:
  1. Demarrer l'API Atlas (AtlasLocal start ou pnpm dev:api) sur :3001
  2. Lancer Atlas.exe → UI Scan sur http://127.0.0.1:17865/
  3. Coller attestation Paradise + cible RoE → Scan
  4. Circuit A (admin) → bouton « Reprendre après Circuit A » (même mission, pas de re-collage)
  5. Policy Guard → suite passive → export JSON/CSV/PDF

RoE: only *.pragma-cloud.com, *.pragma-serve.com, *.pragma.mc (+ listed apexes).
cultivationparadise.com is OUT of scope for scans. No Sign keys in this install.
Download chain: https://cultivationparadise.com/api/atlas/download
