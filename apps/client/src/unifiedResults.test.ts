import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUnifiedResults } from "./unifiedResults.js";

describe("buildUnifiedResults", () => {
  it("mélange services et findings sans silo", () => {
    const rows = buildUnifiedResults(
      [
        {
          id: "m1",
          title: "Mission A",
          status: "REPORT_AVAILABLE",
          synthetic: true,
          jobRuns: [
            {
              id: "j1",
              status: "completed",
              progressPercent: 100,
              progressMessage: "ok",
            },
          ],
          findings: [
            {
              id: "f1",
              title: "Header manquant",
              summary: "X-Frame-Options absent",
              severity: "medium",
              synthetic: true,
            },
          ],
          reports: [
            {
              id: "r1",
              executiveSummary: "Bilan décideur FICTIF",
              synthetic: true,
            },
          ],
        },
      ],
      [],
    );
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.kind),
      ["service", "finding", "report"],
    );
  });

  it("n'ajoute pas deux fois le même finding", () => {
    const finding = {
      id: "f1",
      title: "Dup",
      summary: "x",
      severity: "low",
    };
    const rows = buildUnifiedResults(
      [
        {
          id: "m1",
          title: "M",
          status: "DONE",
          findings: [finding],
        },
      ],
      [finding],
    );
    assert.equal(rows.filter((r) => r.kind === "finding").length, 1);
  });
});
