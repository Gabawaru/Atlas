#!/usr/bin/env node
/**
 * Ops-only: rotate PRAGMA_SIGN_API_KEY + RESEND_API_KEY after a leak.
 * Never prints secret values (presence/length + HTTP codes only).
 * No outbound email. Writes new keys ONLY to .env on success.
 */
import { readFileSync, writeFileSync, copyFileSync, chmodSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENV_PATH = resolve(ROOT, ".env");

const SIGN_BASE = "https://agent-api.pragma-serve.com";
const SIGN_UA = "atlas/1.0";
const RESEND_BASE = "https://api.resend.com";

function log(msg) {
  process.stdout.write(msg + "\n");
}

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    map.set(k, v.trim());
  }
  return map;
}

function maskMeta(name, value) {
  const present = Boolean(value && value.length > 0);
  return `${name}_PRESENT=${present} ${name}_LEN=${present ? value.length : 0}`;
}

function setEnvKey(text, key, newValue) {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${newValue}`;
  if (re.test(text)) return text.replace(re, line);
  const trimmed = text.replace(/\s*$/, "");
  return `${trimmed}\n${line}\n`;
}

function backupEnv(envPath) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${envPath}.bak.${ts}`;
  copyFileSync(envPath, bak);
  try {
    chmodSync(bak, 0o600);
  } catch {
    /* Windows may ignore mode; best-effort */
  }
  return bak;
}

async function http(method, url, headers, body) {
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, text, ok: res.status >= 200 && res.status < 300 };
}

async function rotateSign(apiKey) {
  log("--- SIGN ---");
  log(maskMeta("PRAGMA_SIGN_API_KEY", apiKey));
  if (!apiKey) {
    return { status: "fail", verifyHttp: null, how: "missing key", detail: "PRAGMA_SIGN_API_KEY empty" };
  }

  const list = await http("GET", `${SIGN_BASE}/v1/partner/signatures`, {
    "X-Api-Key": apiKey,
    "User-Agent": SIGN_UA,
  });
  log(`SIGN_LIST_HTTP=${list.status}`);

  const probes = [
    "/v1/partner/api-keys/rotate",
    "/v1/partner/keys/rotate",
    "/v1/partner/api-keys",
  ];
  let anyRotate = false;
  for (const path of probes) {
    const r = await http("POST", `${SIGN_BASE}${path}`, {
      "X-Api-Key": apiKey,
      "User-Agent": SIGN_UA,
      "Content-Type": "application/json",
    });
    log(`SIGN_PROBE ${path} HTTP=${r.status}`);
    if (r.ok) anyRotate = true;
  }

  if (!anyRotate) {
    log("SIGN_ROTATE=blocked — partner API has no key-rotation endpoint (probes 404).");
    log("SIGN_DASHBOARD_STEPS:");
    log("  1) Gab: ask Pragma admin (Ben) to mint a NEW partner key for label atlas-gab.");
    log("  2) Admin on production host (inside agent-api container):");
    log("       cd /home/ben/quirel-hub/clients/2026-06-10-pragma-serve-us-ec008b08/products/platform");
    log("       docker exec -i quirel-hub-agent-api-1 python3 - mint --partner new --label atlas-gab --scopes signatures:read,signatures:write < scripts/mint_partner_api_key.py");
    log("  3) Gab: paste the shown-once plaintext into C:\\Users\\gabri\\Desktop\\dev\\Atlas\\.env as PRAGMA_SIGN_API_KEY only (never chat).");
    log("  4) Verify: GET https://agent-api.pragma-serve.com/v1/partner/signatures with X-Api-Key → HTTP 200.");
    log("  5) Admin: revoke old key by row id (mint_partner_api_key.py revoke --id <id>).");
    log("  STOP for Sign — no invented keys.");
    return {
      status: "blocked",
      verifyHttp: list.status,
      how: "dashboard/admin pending",
      detail: "no partner rotate API; admin CLI mint required",
    };
  }

  return { status: "fail", verifyHttp: list.status, how: "unexpected", detail: "probe ok but no writer" };
}

async function rotateResend(apiKey, envText) {
  log("--- RESEND ---");
  log(maskMeta("RESEND_API_KEY", apiKey));
  if (!apiKey) {
    return {
      status: "fail",
      verifyHttp: null,
      how: "missing key",
      detail: "RESEND_API_KEY empty",
      envText,
      rotated: false,
    };
  }

  const auth = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  const listKeys = await http("GET", `${RESEND_BASE}/api-keys`, auth);
  log(`RESEND_LIST_KEYS_HTTP=${listKeys.status}`);

  const domains = await http("GET", `${RESEND_BASE}/domains`, auth);
  log(`RESEND_DOMAINS_HTTP=${domains.status}`);

  const name = `atlas-rotated-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
  const created = await http("POST", `${RESEND_BASE}/api-keys`, auth, {
    name,
    permission: "full_access",
  });
  log(`RESEND_CREATE_HTTP=${created.status}`);

  if (!created.ok) {
    let reason = "create failed";
    try {
      const j = JSON.parse(created.text);
      reason = j.name || j.message || reason;
      // never log full body if it somehow contained a token
      log(`RESEND_CREATE_ERR_NAME=${String(j.name || "")}`);
      log(`RESEND_CREATE_ERR_MSG=${String(j.message || "").replace(/re_[A-Za-z0-9_]+/g, "re_[REDACTED]")}`);
    } catch {
      log("RESEND_CREATE_ERR=unparsed");
    }
    log("RESEND_ROTATE=blocked — current key cannot mint a replacement via API.");
    log("RESEND_DASHBOARD_STEPS:");
    log("  1) Open https://resend.com/api-keys (logged in as Gab / Atlas owner).");
    log("  2) Click Create API Key.");
    log("  3) Name: atlas-rotated (or similar). Permission: full_access (preferred so future API rotate works) OR sending_access if only mail send is needed.");
    log("  4) Create → copy the token ONCE (shown once only).");
    log("  5) Put it ONLY in C:\\Users\\gabri\\Desktop\\dev\\Atlas\\.env as RESEND_API_KEY=... (never chat/logs/store).");
    log("  6) Smoke: GET https://api.resend.com/domains or GET https://api.resend.com/api-keys with Bearer new key → HTTP 200. Do NOT send email.");
    log("  7) On the same API keys page: delete/revoke the OLD leaked key.");
    log("  STOP for Resend — no invented keys.");
    return {
      status: "blocked",
      verifyHttp: listKeys.status,
      how: "dashboard pending",
      detail: reason,
      envText,
      rotated: false,
    };
  }

  let token = null;
  let newId = null;
  try {
    const j = JSON.parse(created.text);
    token = j.token || null;
    newId = j.id || null;
  } catch {
    return {
      status: "fail",
      verifyHttp: null,
      how: "API",
      detail: "create response unparsed",
      envText,
      rotated: false,
    };
  }
  if (!token || typeof token !== "string") {
    return {
      status: "fail",
      verifyHttp: null,
      how: "API",
      detail: "create response missing token",
      envText,
      rotated: false,
    };
  }
  log(`RESEND_NEW_TOKEN_LEN=${token.length} RESEND_NEW_ID_PRESENT=${Boolean(newId)}`);

  const bak = backupEnv(ENV_PATH);
  log(`ENV_BACKUP=${bak}`);
  let next = setEnvKey(envText, "RESEND_API_KEY", token);
  writeFileSync(ENV_PATH, next, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(ENV_PATH, 0o600);
  } catch {
    /* best-effort */
  }
  // wipe local refs
  token = null;

  const newAuth = {
    Authorization: `Bearer ${parseEnv(next).get("RESEND_API_KEY")}`,
  };
  const smokeKeys = await http("GET", `${RESEND_BASE}/api-keys`, newAuth);
  const smokeDomains = await http("GET", `${RESEND_BASE}/domains`, newAuth);
  log(`RESEND_SMOKE_KEYS_HTTP=${smokeKeys.status}`);
  log(`RESEND_SMOKE_DOMAINS_HTTP=${smokeDomains.status}`);

  const smokeOk = smokeKeys.status === 200 || smokeDomains.status === 200;
  if (!smokeOk) {
    return {
      status: "fail",
      verifyHttp: smokeKeys.status,
      how: "API",
      detail: "new key wrote but smoke not 200",
      envText: next,
      rotated: true,
    };
  }

  // After leak: delete other keys if list works (ids only logged as count)
  if (smokeKeys.ok && newId) {
    try {
      const j = JSON.parse(smokeKeys.text);
      const keys = j.data || j || [];
      let deleted = 0;
      if (Array.isArray(keys)) {
        for (const k of keys) {
          if (!k?.id || k.id === newId) continue;
          const del = await http("DELETE", `${RESEND_BASE}/api-keys/${k.id}`, newAuth);
          if (del.ok) deleted += 1;
          log(`RESEND_DELETE_OLD HTTP=${del.status}`);
        }
      }
      log(`RESEND_OLD_KEYS_DELETED_COUNT=${deleted}`);
    } catch {
      log("RESEND_OLD_KEYS_DELETE=skip_parse");
    }
  }

  return {
    status: "ok",
    verifyHttp: smokeKeys.status === 200 ? smokeKeys.status : smokeDomains.status,
    how: "API",
    detail: "created+wrote+.env; smoke 200; no email sent",
    envText: next,
    rotated: true,
  };
}

async function main() {
  if (!existsSync(ENV_PATH)) {
    log(`ERROR=.env missing at ${ENV_PATH}`);
    process.exit(2);
  }
  const envText = readFileSync(ENV_PATH, "utf8");
  const env = parseEnv(envText);
  const signKey = env.get("PRAGMA_SIGN_API_KEY") || "";
  const resendKey = env.get("RESEND_API_KEY") || "";

  log(`ENV_PATH=${ENV_PATH}`);
  log(maskMeta("PRAGMA_SIGN_API_KEY", signKey));
  log(maskMeta("RESEND_API_KEY", resendKey));

  const sign = await rotateSign(signKey);
  const resend = await rotateResend(resendKey, envText);

  log("--- SUMMARY ---");
  log(`ROTATE_SIGN=${sign.status}`);
  log(`ROTATE_RESEND=${resend.status}`);
  log(`SIGN_HOW=${sign.how}`);
  log(`RESEND_HOW=${resend.how}`);
  log(`SIGN_VERIFY_HTTP=${sign.verifyHttp}`);
  log(`RESEND_VERIFY_HTTP=${resend.verifyHttp}`);
  log(`ERROR=${[sign.detail, resend.detail].filter(Boolean).join(" | ")}`);
}

main().catch((e) => {
  log(`ERROR=${e instanceof Error ? e.message : "unknown"}`);
  process.exit(1);
});
