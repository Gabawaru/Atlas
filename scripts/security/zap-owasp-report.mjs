#!/usr/bin/env node
/**
 * Map ZAP traditional-json (+ optional static findings) → OWASP Top 10 (2021)
 * and emit visual HTML + Markdown reports for Atlas axe 4.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

const OWASP = [
  { id: "A01:2021", name: "Broken Access Control" },
  { id: "A02:2021", name: "Cryptographic Failures" },
  { id: "A03:2021", name: "Injection" },
  { id: "A04:2021", name: "Insecure Design" },
  { id: "A05:2021", name: "Security Misconfiguration" },
  { id: "A06:2021", name: "Vulnerable and Outdated Components" },
  { id: "A07:2021", name: "Identification and Authentication Failures" },
  { id: "A08:2021", name: "Software and Data Integrity Failures" },
  { id: "A09:2021", name: "Security Logging and Monitoring Failures" },
  { id: "A10:2021", name: "Server-Side Request Forgery (SSRF)" },
];

/** ZAP pluginid / alert name / CWE → OWASP category */
const PLUGIN_OWASP = {
  10035: "A05:2021", // HSTS
  10038: "A05:2021", // CSP missing
  10055: "A05:2021", // CSP
  10020: "A05:2021", // X-Frame-Options
  10021: "A05:2021", // X-Content-Type-Options
  10016: "A05:2021", // Web Browser XSS Protection
  10063: "A05:2021", // Permissions Policy
  10098: "A05:2021", // Cross-Domain Misconfiguration
  10054: "A05:2021", // Cookie without Secure/HttpOnly
  10010: "A05:2021", // Cookie No HttpOnly
  10011: "A05:2021", // Cookie No Secure
  10017: "A05:2021", // Cross-Domain JS
  10036: "A05:2021", // HTTP Server Response Header
  10037: "A05:2021", // Strict-Transport-Security Max Age
  10105: "A05:2021", // Weak Authentication Method
  10049: "A05:2021", // Storable / Cacheable
  10050: "A09:2021", // Retrieved from Cache
  10202: "A02:2021", // Absence of Anti-CSRF Tokens (edge)
  10044: "A02:2021", // Big Redirect
  90022: "A03:2021", // Application Error Disclosure
  10023: "A03:2021", // Information Disclosure
  10027: "A03:2021", // Information Disclosure - Suspicious
  10096: "A05:2021", // Timestamp Disclosure
  10094: "A05:2021", // Base64 Disclosure
  10112: "A07:2021", // Session Management
  40012: "A03:2021", // XSS (if ever present — not expected in passive)
  40014: "A03:2021",
  40018: "A03:2021", // SQL
  90019: "A10:2021", // Server Side Include
  0: "A05:2021",
};

const CWE_OWASP = {
  319: "A02:2021", // cleartext
  523: "A02:2021",
  311: "A02:2021",
  614: "A05:2021",
  1004: "A05:2021",
  693: "A05:2021",
  1021: "A05:2021",
  79: "A03:2021",
  89: "A03:2021",
  918: "A10:2021",
  200: "A01:2021",
  287: "A07:2021",
  352: "A01:2021",
  829: "A08:2021",
  1104: "A06:2021",
  1035: "A06:2021",
};

const RISK = { 0: "info", 1: "low", 2: "medium", 3: "high" };

function parseArgs(argv) {
  const out = { zapJson: null, staticJson: null, outDir: ".", stamp: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--zap-json") out.zapJson = argv[++i];
    else if (a === "--static-json") out.staticJson = argv[++i];
    else if (a === "--out-dir") out.outDir = argv[++i];
    else if (a === "--stamp") out.stamp = argv[++i];
    else throw new Error(`unknown arg ${a}`);
  }
  if (!out.zapJson) throw new Error("--zap-json required");
  out.stamp ||= new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return out;
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapOwasp(pluginid, cweid, name) {
  const pid = String(pluginid || "");
  if (PLUGIN_OWASP[pid]) return PLUGIN_OWASP[pid];
  const cwe = String(cweid || "");
  if (CWE_OWASP[cwe]) return CWE_OWASP[cwe];
  const n = (name || "").toLowerCase();
  if (n.includes("transport") || n.includes("hsts") || n.includes("ssl") || n.includes("tls"))
    return "A02:2021";
  if (n.includes("cookie") || n.includes("header") || n.includes("csp") || n.includes("cors"))
    return "A05:2021";
  if (n.includes("inject") || n.includes("xss") || n.includes("sql")) return "A03:2021";
  if (n.includes("auth") || n.includes("session")) return "A07:2021";
  if (n.includes("component") || n.includes("cve") || n.includes("library")) return "A06:2021";
  if (n.includes("ssrf")) return "A10:2021";
  return "A05:2021";
}

function collectZap(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const findings = [];
  for (const site of raw.site || []) {
    const host = site["@host"] || "";
    for (const a of site.alerts || []) {
      const owasp = mapOwasp(a.pluginid, a.cweid, a.name || a.alert);
      const uris = (a.instances || []).map((i) => i.uri).filter(Boolean);
      findings.push({
        source: "zap-passive",
        host,
        name: a.name || a.alert,
        pluginid: String(a.pluginid || ""),
        cweid: String(a.cweid || ""),
        risk: RISK[String(a.riskcode)] || "info",
        confidence: a.confidence,
        owasp,
        uris,
        desc: stripHtml(a.desc).slice(0, 280),
        solution: stripHtml(a.solution).slice(0, 200),
        count: Number(a.count || uris.length || 1),
      });
    }
  }
  return {
    generated: raw["@generated"] || raw.created || "",
    zapVersion: raw["@version"] || "",
    insights: raw.insights || [],
    findings,
  };
}

/** Optional make-secure / SAST JSON: { findings: [{ title, severity, ruleId?, cwe?, file? }] } */
function collectStatic(path) {
  if (!path) return [];
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.findings || raw.results || [];
  return list.map((f) => {
    const name = f.title || f.name || f.message || f.ruleId || "static finding";
    const cwe = String(f.cwe || f.cweId || "").replace(/^CWE-/i, "");
    return {
      source: "static",
      host: f.host || f.file || "(repo)",
      name,
      pluginid: String(f.ruleId || f.pluginid || ""),
      cweid: cwe,
      risk: String(f.severity || f.risk || "info").toLowerCase(),
      confidence: f.confidence || "",
      owasp: mapOwasp(f.pluginid, cwe, name),
      uris: f.file ? [f.file] : [],
      desc: stripHtml(f.description || f.desc || "").slice(0, 280),
      solution: stripHtml(f.solution || "").slice(0, 200),
      count: 1,
    };
  });
}

function groupByOwasp(findings) {
  const g = Object.fromEntries(OWASP.map((o) => [o.id, []]));
  for (const f of findings) {
    const id = f.owasp in g ? f.owasp : "A05:2021";
    g[id].push(f);
  }
  return g;
}

function riskCounts(findings) {
  const c = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    const k = c[f.risk] != null ? f.risk : "info";
    c[k] += 1;
  }
  return c;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(model) {
  const { stamp, hosts, findings, grouped, counts, zapVersion, notes } = model;
  const bars = OWASP.map((o) => {
    const n = grouped[o.id].length;
    const w = Math.max(n * 28, n ? 8 : 0);
    return `<div class="bar-row"><span class="oid">${esc(o.id)}</span><span class="oname">${esc(o.name)}</span><span class="track"><span class="fill" style="width:${w}px"></span></span><span class="n">${n}</span></div>`;
  }).join("\n");

  const rows = findings
    .map(
      (f) => `<tr>
  <td><span class="pill ${esc(f.risk)}">${esc(f.risk)}</span></td>
  <td>${esc(f.owasp)}</td>
  <td>${esc(f.source)}</td>
  <td>${esc(f.host)}</td>
  <td>${esc(f.name)}</td>
  <td>CWE-${esc(f.cweid || "—")}</td>
</tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Atlas axe 4 — ZAP passive × OWASP</title>
<style>
:root{--bg:#0e1514;--panel:#15201e;--fg:#e8f0ee;--muted:#8aa39e;--teal:#2f8f8a;--line:#243331;
--high:#c45c4a;--medium:#c4923a;--low:#5a8fc4;--info:#6a7a78}
*{box-sizing:border-box}
body{margin:0;font:15px/1.45 "IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;background:
radial-gradient(1200px 600px at 10% -10%,#1a3330 0%,transparent 55%),
radial-gradient(900px 500px at 100% 0%,#1c2a28 0%,transparent 50%),var(--bg);color:var(--fg)}
main{max-width:960px;margin:0 auto;padding:2rem 1.25rem 3.5rem}
h1{font:650 1.55rem/1.2 "IBM Plex Sans",sans-serif;letter-spacing:.01em;margin:0 0 .35rem}
.meta{color:var(--muted);font-size:.9rem;margin-bottom:1.5rem}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin:1rem 0 1.5rem}
@media(max-width:700px){.cards{grid-template-columns:repeat(2,1fr)}}
.card{background:var(--panel);border:1px solid var(--line);padding:1rem;border-radius:4px}
.card b{display:block;font-size:1.6rem;font-variant-numeric:tabular-nums}
.card span{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.04em}
.card.high b{color:var(--high)}.card.medium b{color:var(--medium)}.card.low b{color:var(--low)}.card.info b{color:var(--info)}
h2{font-size:1.05rem;margin:1.75rem 0 .75rem;color:var(--teal)}
.bars{background:var(--panel);border:1px solid var(--line);padding:1rem;border-radius:4px}
.bar-row{display:grid;grid-template-columns:5.5rem 1fr 120px 2rem;gap:.5rem;align-items:center;margin:.35rem 0;font-size:.88rem}
.oid{color:var(--teal);font-variant-numeric:tabular-nums}.oname{color:var(--muted)}
.track{height:10px;background:#0a1211;border-radius:2px;overflow:hidden}
.fill{display:block;height:100%;background:linear-gradient(90deg,var(--teal),#4db5af)}
.n{text-align:right;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th,td{border-bottom:1px solid var(--line);padding:.55rem .4rem;text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.03em}
.pill{display:inline-block;padding:.1rem .45rem;border-radius:3px;font-size:.75rem;text-transform:uppercase}
.pill.high{background:#3a1f1a;color:var(--high)}.pill.medium{background:#3a2f14;color:var(--medium)}
.pill.low{background:#1a2a3a;color:var(--low)}.pill.info{background:#1a2221;color:var(--info)}
.notes{color:var(--muted);font-size:.88rem;margin-top:1.5rem}
.notes code{color:var(--teal)}
ul.hosts{margin:.4rem 0;padding-left:1.1rem;color:var(--muted)}
</style>
</head>
<body>
<main>
  <h1>Atlas axe 4 — passive ZAP × OWASP Top 10</h1>
  <p class="meta">Stamp <code>${esc(stamp)}</code> · ZAP ${esc(zapVersion || "—")} · RoE: <code>*-dev.pragma-cloud.com</code> only · GET requestor · no spider / active / mutations</p>

  <div class="cards">
    <div class="card high"><b>${counts.high}</b><span>High</span></div>
    <div class="card medium"><b>${counts.medium}</b><span>Medium</span></div>
    <div class="card low"><b>${counts.low}</b><span>Low</span></div>
    <div class="card info"><b>${counts.info}</b><span>Info</span></div>
  </div>

  <h2>Hosts scanned</h2>
  <ul class="hosts">${hosts.map((h) => `<li><code>${esc(h)}</code></li>`).join("")}</ul>

  <h2>OWASP Top 10 (2021) — finding counts</h2>
  <div class="bars">${bars}</div>

  <h2>Findings</h2>
  <table>
    <thead><tr><th>Risk</th><th>OWASP</th><th>Source</th><th>Host</th><th>Alert</th><th>CWE</th></tr></thead>
    <tbody>
${rows || `<tr><td colspan="6">No alerts</td></tr>`}
    </tbody>
  </table>

  <p class="notes">${notes.map(esc).join("<br/>")}</p>
</main>
</body>
</html>`;
}

function renderMd(model) {
  const { stamp, hosts, findings, grouped, counts, zapVersion, notes } = model;
  const lines = [
    `# Atlas axe 4 — passive ZAP × OWASP Top 10`,
    ``,
    `| | |`,
    `|---|---|`,
    `| Stamp | \`${stamp}\` |`,
    `| ZAP | ${zapVersion || "—"} |`,
    `| RoE | \`*-dev.pragma-cloud.com\` only · GET requestor · no spider/active/mutations |`,
    `| High / Med / Low / Info | **${counts.high}** / **${counts.medium}** / **${counts.low}** / **${counts.info}** |`,
    ``,
    `## Hosts`,
    ``,
    ...hosts.map((h) => `- \`${h}\``),
    ``,
    `## OWASP Top 10 (2021)`,
    ``,
    `| Category | Count |`,
    `|---|---:|`,
    ...OWASP.map((o) => `| ${o.id} ${o.name} | ${grouped[o.id].length} |`),
    ``,
    `## Findings`,
    ``,
    `| Risk | OWASP | Source | Host | Alert | CWE |`,
    `|---|---|---|---|---|---|`,
    ...findings.map(
      (f) =>
        `| ${f.risk} | ${f.owasp} | ${f.source} | \`${f.host}\` | ${f.name.replace(/\|/g, "/")} | ${f.cweid || "—"} |`,
    ),
    ``,
    `## Notes`,
    ``,
    ...notes.map((n) => `- ${n}`),
    ``,
  ];
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  mkdirSync(args.outDir, { recursive: true });
  const zap = collectZap(args.zapJson);
  const staticF = collectStatic(args.staticJson);
  const findings = [...zap.findings, ...staticF];
  const hosts = [];
  try {
    const raw = JSON.parse(readFileSync(args.zapJson, "utf8"));
    for (const s of raw.site || []) {
      if (s["@host"] && !hosts.includes(s["@host"])) hosts.push(s["@host"]);
    }
  } catch {
    /* ignore */
  }
  for (const f of findings) {
    if (f.host && f.host !== "(repo)" && !hosts.includes(f.host)) hosts.push(f.host);
  }

  const grouped = groupByOwasp(findings);
  const counts = riskCounts(findings);
  const notes = [
    "pragma-serve.com (prod) header issues are real but origin fixes are Pragma-side — this report focuses on Atlas tooling + *-dev baseline.",
    "Default host list excludes client-brand product slugs (no client data).",
    "Static findings: pass ATLAS_ZAP_STATIC_JSON / --static-json when make-secure emits a JSON bundle (grouped into the same OWASP buckets).",
    `Source ZAP JSON: ${basename(args.zapJson)}`,
  ];

  const model = {
    stamp: args.stamp,
    hosts,
    findings,
    grouped,
    counts,
    zapVersion: zap.zapVersion,
    notes,
  };

  const htmlPath = join(args.outDir, `axe4-zap-owasp-${args.stamp}.html`);
  const mdPath = join(args.outDir, `axe4-zap-owasp-${args.stamp}.md`);
  const latestMd = join(args.outDir, "axe4-zap-owasp-report.md");
  const latestHtml = join(args.outDir, "axe4-zap-owasp-report.html");
  const summaryJson = join(args.outDir, `axe4-zap-owasp-${args.stamp}.summary.json`);

  writeFileSync(htmlPath, renderHtml(model));
  writeFileSync(mdPath, renderMd(model));
  writeFileSync(latestMd, renderMd(model));
  writeFileSync(latestHtml, renderHtml(model));
  writeFileSync(
    summaryJson,
    JSON.stringify({ stamp: args.stamp, counts, hosts, findings, grouped }, null, 2),
  );
  console.log(`Wrote ${htmlPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${latestMd}`);
}

main();
