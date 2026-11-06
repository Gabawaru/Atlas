Atlas v1
========
Assistant de pentest autorise (Pragma / entreprise A).

Installed by Atlas-Setup.exe:
  - Atlas.exe — plateforme Scan locale (http://127.0.0.1:17865/)
  - AtlasLocal.exe — lanceur stack (start / install / stop)
  - tools\Install-AtlasPrereqs.* — prerequis hote (Node/pnpm/Docker)

Workflow Scan:
  1. (Une fois) Menu Demarrer → Atlas → Installer le stack (+ coller .env dans %USERPROFILE%\Atlas)
  2. Lancer Atlas.exe → bouton Démarrer l’API (ou raccourci Demarrer l'API)
  3. Attendre Tester = OK sur :3001
  4. Coller attestation Paradise + cible RoE → Scan
  5. Circuit A (admin) → Reprendre après Circuit A (meme mission)
  6. Policy Guard → suite passive → export JSON/CSV/PDF

RoE: only *.pragma-cloud.com, *.pragma-serve.com, *.pragma.mc (+ listed apexes).
cultivationparadise.com is OUT of scope for scans. No Sign keys in this install.
Download chain: https://cultivationparadise.com/api/atlas/download
