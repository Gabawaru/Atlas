Atlas v1
========
Assistant de pentest autorise (Pragma / entreprise A).

Installed by Atlas-Setup.exe:
  - Atlas.exe — plateforme Scan locale (http://127.0.0.1:17865/)
  - AtlasLocal.exe — lanceur stack (start / install / stop)
  - tools\Install-AtlasPrereqs.* — prerequis hote (Node/pnpm/Docker)

Health:
  curl http://127.0.0.1:17865/healthz
  → {"ok":true,"service":"atlas-shell","os":"windows",...}
  Si 404 : PE obsolete — rebuild via remote-work/atlas-v1/build.sh et relancer Atlas.exe.

Workflow Scan:
  1. (Une fois) Menu Démarrer → Atlas → Installer le stack (+ coller .env dans %USERPROFILE%\Atlas)
  2. Lancer Atlas.exe → bouton Démarrer l’API (ou raccourci Démarrer l'API)
  3. Attendre Tester = OK sur :3001
  4. Cible RoE (ex. pragma-serve.com) → Scan (pas de jeton Paradise)
  5. Circuit A (admin) → Reprendre après Circuit A (meme mission)
  6. Policy Guard → suite passive → export JSON/CSV/PDF

Authz local/dev:
  ATLAS_AUTHZ=signed
  Si PRAGMA_SIGN_API_KEY est present, Sign masque le chemin local signed —
  commenter temporairement la cle Sign pour les scans mock/local, puis restaurer.

RoE: only *.pragma-cloud.com, *.pragma-serve.com, *.pragma.mc (+ listed apexes).
Download chain: https://atlas-secu.com/Atlas-Setup.exe
