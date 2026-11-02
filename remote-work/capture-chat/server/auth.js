import crypto from "node:crypto";

const COOKIE_NAME = "capture_chat_session";
const DEFAULT_DOMAIN = "atlas-secu.com";
const DEFAULT_EMAILS = [
  "gabriel@atlas-secu.com",
  "ops@atlas-secu.com",
];

function sessionSecret() {
  return (
    process.env.CAPTURE_CHAT_SESSION_SECRET ||
    process.env.CAPTURE_CHAT_TOKEN ||
    ""
  );
}

export function allowedDomain() {
  return (
    process.env.CAPTURE_CHAT_ALLOWED_DOMAIN || DEFAULT_DOMAIN
  ).toLowerCase();
}

export function allowedEmails() {
  const raw = process.env.CAPTURE_CHAT_ALLOWED_EMAILS || "";
  const fromEnv = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_EMAILS, ...fromEnv]);
}

export function normalizeEmail(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

export function isAllowedEmail(email) {
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) return false;
  if (allowedEmails().has(e)) return true;
  const domain = e.split("@").pop();
  return domain === allowedDomain();
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function signSession(email, maxAgeSec = 60 * 60 * 24 * 14) {
  const secret = sessionSecret();
  if (!secret) throw new Error("session secret missing");
  const payload = {
    email: normalizeEmail(email),
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(
    crypto.createHmac("sha256", secret).update(body).digest(),
  );
  return `${body}.${sig}`;
}

export function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }
  const secret = sessionSecret();
  if (!secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(
    crypto.createHmac("sha256", secret).update(body).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8"));
    if (!payload?.email || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!isAllowedEmail(payload.email)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function sessionCookieHeader(token, maxAgeSec = 60 * 60 * 24 * 14) {
  const secure = process.env.COOKIE_SECURE !== "0";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader() {
  const secure = process.env.COOKIE_SECURE !== "0";
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export { COOKIE_NAME };
