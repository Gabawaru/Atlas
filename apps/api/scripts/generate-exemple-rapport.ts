/**
 * Génère docs/exemples/rapport-presence-web-fictif.{json,csv,pdf}
 * Marqué FICTIF — même pipeline que les exports runtime.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateReportExports } from "../src/reports/report-export";

async function main() {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const out = path.join(root, "docs", "exemples");
  await mkdir(out, { recursive: true });

  const result = await generateReportExports(
    {
      reportId: "rapport-presence-web-fictif",
      missionId: "mission-demo-fictive",
      missionTitle: "[FICTIF] Présence web — exemple versionné",
      synthetic: true,
      executiveSummary:
        "[FICTIF] Bilan décideur : exposition limitée sur example.com (domaine de documentation). Aucune cible réelle d'entreprise. Données de démonstration Atlas MVP.",
      technicalDetail:
        "[FICTIF] Module web.passive.presence.v1 — DNS A/AAAA, HTTP HEAD, métadonnées TLS. Rate limit 30/min. Preuves dans le scope approuvé uniquement. Signature mock (pas eIDAS).",
      findings: [
        {
          severity: "info",
          title: "[FICTIF] En-tête Server observé",
          summary: "Finding de démonstration uniquement.",
          technical: "evidenceHash: demo",
        },
        {
          severity: "low",
          title: "[FICTIF] HSTS non évalué en profondeur",
          summary:
            "Contrôle passif uniquement — pas de conclusion de conformité.",
          technical: null,
        },
      ],
      evidence: [
        {
          host: "example.com",
          inScope: true,
          dns: { resolved: true, addresses: ["93.184.216.34"] },
          note: "FICTIF — illustration versionnée",
        },
      ],
      scopeHash: "demo-scope-hash-fictif",
      moduleId: "web.passive.presence.v1",
    },
    out,
  );

  // generateReportExports écrit sous reportId — renommer si besoin
  // Ici reportId = nom stable attendu.
  await writeFile(
    path.join(out, "README.md"),
    `# Exemples de rapports — FICTIF

Fichiers générés par \`apps/api/scripts/generate-exemple-rapport.ts\` (même pipeline que les exports runtime).

| Fichier | Format |
|---------|--------|
| \`rapport-presence-web-fictif.json\` | JSON |
| \`rapport-presence-web-fictif.csv\` | CSV |
| \`rapport-presence-web-fictif.pdf\` | PDF |

**Marqueur :** \`synthetic: true\` / bannière FICTIF. Voir aussi \`docs/limites-et-evolution.md\`.

Régénérer : \`pnpm docs:exemple-rapport\`

Hashes (sha256) :

\`\`\`json
${JSON.stringify(result.contentHashes, null, 2)}
\`\`\`
`,
  );

  console.log("Exemples écrits dans", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
