import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { RiskTableRow } from "./riskTable";
import {
  emptyVulnTrackingStore,
  filterArchiveEntries,
  formatOpenRange,
  ingestRiskTableIntoTracking,
  markVulnResolved,
  shortVulnIdFromFingerprint,
  vulnFingerprint,
} from "./vulnTracking";
import { buildVulnArchivePdfMd } from "./vulnArchive";

function row(partial: Partial<RiskTableRow> & Pick<RiskTableRow, "control">): RiskTableRow {
  return {
    host: "pragma-serve.com",
    url: "https://pragma-serve.com/",
    riskCode: "medium",
    risk: "moyen",
    compromise: "Exposition moyenne",
    signal: "hsts",
    ...partial,
  };
}

describe("vulnTracking fingerprint + CCV", () => {
  it("empreinte stable control+url+host+riskCode", () => {
    const a = vulnFingerprint({
      control: "Header HSTS absent",
      url: "https://pragma-serve.com/",
      host: "pragma-serve.com",
      riskCode: "medium",
    });
    const b = vulnFingerprint({
      control: "  Header HSTS absent ",
      url: "https://pragma-serve.com/",
      host: "Pragma-Serve.com",
      riskCode: "medium",
    });
    assert.equal(a, b);
  });

  it("ID CCV déterministe lié à l'empreinte", () => {
    const fp = vulnFingerprint({
      control: "Header CSP absent",
      url: "https://x.example/",
      host: "x.example",
      riskCode: "medium",
    });
    const id1 = shortVulnIdFromFingerprint(fp);
    const id2 = shortVulnIdFromFingerprint(fp);
    assert.match(id1, /^CCV-[A-Z0-9]{6}$/);
    assert.equal(id1, id2);
  });

  it("ingest match cross-scan conserve fingerprint + shortId", () => {
    const r = row({ control: "Header HSTS absent" });
    let store = emptyVulnTrackingStore();
    store = ingestRiskTableIntoTracking(store, [r], {
      seenAt: "2026-11-01T10:00:00.000Z",
      missionId: "m1",
      reportId: "rep-1",
    });
    assert.equal(store.entries.length, 1);
    const first = store.entries[0]!;
    store = ingestRiskTableIntoTracking(store, [r], {
      seenAt: "2026-11-10T12:00:00.000Z",
      missionId: "m2",
      reportId: "rep-2",
    });
    assert.equal(store.entries.length, 1);
    assert.equal(store.entries[0]!.fingerprint, first.fingerprint);
    assert.equal(store.entries[0]!.shortId, first.shortId);
    assert.equal(store.entries[0]!.seenCount, 2);
    assert.equal(store.entries[0]!.lastSeenAt, "2026-11-10T12:00:00.000Z");
  });

  it("même reportId n'incrémente pas seenCount", () => {
    const r = row({ control: "Header CSP absent" });
    let store = ingestRiskTableIntoTracking(emptyVulnTrackingStore(), [r], {
      reportId: "rep-dup",
      seenAt: "2026-11-01T10:00:00.000Z",
    });
    assert.equal(store.entries[0]!.seenCount, 1);
    store = ingestRiskTableIntoTracking(store, [r], {
      reportId: "rep-dup",
      seenAt: "2026-11-01T11:00:00.000Z",
    });
    assert.equal(store.entries[0]!.seenCount, 1);
  });

  it("ignore les lignes info", () => {
    const store = ingestRiskTableIntoTracking(emptyVulnTrackingStore(), [
      row({ control: "DNS — résolution", riskCode: "info", risk: "info" }),
    ]);
    assert.equal(store.entries.length, 0);
  });

  it("plage de dates ouvert vs résolu", () => {
    let store = ingestRiskTableIntoTracking(emptyVulnTrackingStore(), [
      row({ control: "Header X-Frame-Options absent" }),
    ], { seenAt: "2026-11-01T08:00:00.000Z" });
    const open = store.entries[0]!;
    assert.match(formatOpenRange(open), /→ ouvert$/);
    store = markVulnResolved(store, open.fingerprint, {
      resolutionNotes: "Ajout XFO SAMEORIGIN",
      fixAnalysis: "Clickjacking bloqué — retest OK",
      resolvedAt: "2026-11-05T18:30:00.000Z",
    });
    const closed = store.entries[0]!;
    assert.equal(closed.status, "resolved");
    assert.equal(closed.shortId, open.shortId);
    assert.match(formatOpenRange(closed), /→/);
    assert.doesNotMatch(formatOpenRange(closed), /ouvert$/);
  });
});

describe("archive filter + PDF.md", () => {
  it("filtre recherche ID / nom + tri alpha", () => {
    let store = emptyVulnTrackingStore();
    store = ingestRiskTableIntoTracking(store, [
      row({ control: "Header HSTS absent" }),
      row({
        control: "Cookie — flags manquants (sid)",
        riskCode: "low",
        risk: "faible",
        signal: "Secure, HttpOnly",
        compromise: "Exposition faible",
      }),
    ], { seenAt: "2026-11-01T00:00:00.000Z" });
    for (const e of [...store.entries]) {
      store = markVulnResolved(store, e.fingerprint, {
        resolutionNotes: "patch",
        fixAnalysis: "ok",
        resolvedAt: "2026-11-02T00:00:00.000Z",
      });
    }
    const byName = filterArchiveEntries(store, { query: "hsts" });
    assert.equal(byName.length, 1);
    assert.match(byName[0]!.control, /HSTS/i);
    const byId = filterArchiveEntries(store, {
      query: store.entries[0]!.shortId.toLowerCase(),
    });
    assert.ok(byId.length >= 1);
    const alpha = filterArchiveEntries(store, { alphabetical: true });
    assert.equal(alpha.length, 2);
    assert.ok(
      alpha[0]!.control.localeCompare(alpha[1]!.control, "fr") <= 0,
    );
  });

  it("PDF.md contient ID CCV + plage + analyse", () => {
    let store = ingestRiskTableIntoTracking(emptyVulnTrackingStore(), [
      row({ control: "Header CSP absent" }),
    ], { seenAt: "2026-11-01T10:00:00.000Z" });
    const e = store.entries[0]!;
    store = markVulnResolved(store, e.fingerprint, {
      resolutionNotes: "CSP default-src 'self'",
      fixAnalysis: "XSS surface réduite — retest headers OK",
      resolvedAt: "2026-11-03T12:00:00.000Z",
    });
    const doc = buildVulnArchivePdfMd(store, {
      generatedAt: "2026-11-10T14:00:00.000Z",
    });
    assert.match(doc.filename, /\.pdf\.md$/);
    assert.match(doc.markdown, new RegExp(e.shortId));
    assert.match(doc.markdown, /Analyse du correctif final/);
    assert.match(doc.markdown, /CSP default-src/);
    assert.match(doc.markdown, /Plage ouverte/);
  });
});
