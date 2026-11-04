import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filenameFromDisposition,
  reportExportUrl,
} from "./reportExport.js";

describe("reportExportUrl", () => {
  it("construit l'URL d'export avec format", () => {
    assert.equal(
      reportExportUrl(
        "http://localhost:3001",
        "cmw2b35rd000tkhswz6ccxetm",
        "cmw2b3pow0021khswv6t5lwyz",
        "pdf",
      ),
      "http://localhost:3001/v1/missions/cmw2b35rd000tkhswz6ccxetm/reports/cmw2b3pow0021khswv6t5lwyz/export?format=pdf",
    );
  });

  it("enlève le slash final de la base API", () => {
    assert.match(
      reportExportUrl("http://api.test/", "m1", "r1", "json"),
      /^http:\/\/api\.test\/v1\/missions\/m1\/reports\/r1\/export\?format=json$/,
    );
  });
});

describe("filenameFromDisposition", () => {
  it("lit filename entre guillemets", () => {
    assert.equal(
      filenameFromDisposition(
        'attachment; filename="cmw2b3pow0021khswv6t5lwyz.pdf"',
        "r1",
        "pdf",
      ),
      "cmw2b3pow0021khswv6t5lwyz.pdf",
    );
  });

  it("fallback reportId.format si header absent", () => {
    assert.equal(filenameFromDisposition(null, "r1", "csv"), "r1.csv");
  });
});
