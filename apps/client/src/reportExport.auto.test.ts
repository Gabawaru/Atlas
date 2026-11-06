import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTO_REPORT_FORMAT,
  pickReadyReportFromExecute,
} from "./reportExport.js";

describe("pickReadyReportFromExecute", () => {
  it("retourne mission+rapport quand ALLOW et REPORT_AVAILABLE", () => {
    const ref = pickReadyReportFromExecute({
      gate: { decision: "ALLOW" },
      mission: {
        id: "m1",
        status: "REPORT_AVAILABLE",
        reports: [{ id: "r1" }],
      },
    });
    assert.deepEqual(ref, { missionId: "m1", reportId: "r1" });
  });

  it("refuse REJECT même si un rapport est présent", () => {
    assert.equal(
      pickReadyReportFromExecute({
        gate: { decision: "REJECT", code: "NO_AUTHZ" },
        mission: {
          id: "m1",
          status: "BLOCKED",
          reports: [{ id: "r1" }],
        },
      }),
      null,
    );
  });

  it("refuse si status pas encore REPORT_AVAILABLE", () => {
    assert.equal(
      pickReadyReportFromExecute({
        gate: { decision: "ALLOW" },
        mission: {
          id: "m1",
          status: "RUNNING",
          reports: [{ id: "r1" }],
        },
      }),
      null,
    );
  });

  it("accepte fallbackMissionId si mission.id absent", () => {
    const ref = pickReadyReportFromExecute(
      {
        gate: { decision: "ALLOW" },
        mission: {
          status: "REPORT_AVAILABLE",
          reports: [{ id: "r9" }],
        },
      },
      "m-fallback",
    );
    assert.deepEqual(ref, { missionId: "m-fallback", reportId: "r9" });
  });

  it("AUTO_REPORT_FORMAT est pdf (chemin export existant)", () => {
    assert.equal(AUTO_REPORT_FORMAT, "pdf");
  });
});
