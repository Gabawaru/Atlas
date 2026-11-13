/**
 * Pin NSIS silent-install guards (atl-retours Windows /S hang).
 */
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const nsi = readFileSync(
  join(root, "remote-work/atlas-v1/installer/Atlas.nsi"),
  "utf8",
);
const setupPath = join(
  root,
  "remote-work/offline-installer/bin/Atlas-Setup.exe",
);

describe("Windows NSIS silent /S guards", () => {
  it("PRODUCT_VERSION is semver X.Y.Z", () => {
    const m = nsi.match(/!define PRODUCT_VERSION "(\d+\.\d+\.\d+)"/);
    assert.ok(m, "PRODUCT_VERSION define required");
    assert.match(m![1]!, /^\d+\.\d+\.\d+$/);
  });

  it("IfSilent skips uninstall MessageBox + SetAutoClose + no auto-run", () => {
    assert.match(nsi, /IfSilent skipUninstDesktop/);
    assert.match(nsi, /MessageBox MB_YESNO/);
    assert.match(nsi, /IfSilent 0 \+2[\s\S]*SetAutoClose true/);
    assert.match(nsi, /MUI_FINISHPAGE_RUN_NOTCHECKED/);
  });

  it("shipped Setup PE is present and non-stub sized", () => {
    const st = statSync(setupPath);
    assert.ok(st.size >= 2_000_000, `PE too small: ${st.size}`);
    const hdr = readFileSync(setupPath).subarray(0, 2).toString("binary");
    assert.equal(hdr, "MZ");
  });
});
