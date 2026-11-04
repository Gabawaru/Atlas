/**
 * Paradise in-session drawn-signature attestation (P0 owner authz).
 *
 * Cultivation Paradise (PIN session Ben/Gab/Romain) issues a compact HMAC
 * attestation after the person draws their signature. Atlas verifies it with
 * ATLAS_PARADISE_AUTHZ_SECRET — no PRAGMA_SIGN_API_KEY required.
 *
 * Compact token: base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, payloadBytes))
 * Envelope ids are prefixed `paradise-`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const PARADISE_PROVIDER_NAME = "paradise-gate" as const;
export const PARADISE_ENVELOPE_PREFIX = "paradise-" as const;
export const PARADISE_DEFAULT_BASE_URL = "https://cultivationparadise.com";
export const PARADISE_ARTIFACT_SCHEME = "paradise-attestation://v1/" as const;

export type ParadisePerson = "benjamin" | "gabriel" | "romain";

export type ParadiseAttestationPayload = {
  /** Schema version */
  v: 1;
  iss: "cultivationparadise.com";
  provider: typeof PARADISE_PROVIDER_NAME;
  envelopeId: string;
  status: "pending" | "signed" | "declined" | "expired";
  person: ParadisePerson;
  signerEmail: string;
  signerName: string;
  purpose: "atlas-owner-authz" | string;
  /** Mission / scope document hash (sha256 hex) when known */
  documentHash?: string;
  /** Optional RoE host hints (informational; Policy Guard still enforces allowlist) */
  targetHosts?: string[];
  /** sha256 of drawn stroke / PNG bytes */
  signatureStrokeHash: string;
  iat: number;
  exp: number;
};

export type ParadiseAuthzRemote = {
  id: string;
  status: ParadiseAttestationPayload["status"];
  person: ParadisePerson;
  signerEmail: string;
  signerName: string;
  documentHash?: string;
  signatureStrokeHash?: string;
  /** Compact attestation token when status=signed */
  attestation?: string;
  signedAt?: string;
  drawUrl?: string;
};

function b64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function isParadiseEnvelopeId(id: string | null | undefined): boolean {
  return Boolean(id?.trim().startsWith(PARADISE_ENVELOPE_PREFIX));
}

export function isParadiseAuthzConfigured(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return Boolean((env.ATLAS_PARADISE_AUTHZ_SECRET ?? "").trim());
}

export function paradiseBaseUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const raw = (env.ATLAS_PARADISE_AUTHZ_BASE_URL ?? "").trim();
  return (raw || PARADISE_DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function mintParadiseAttestation(
  payload: ParadiseAttestationPayload,
  secret: string,
): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(
    createHmac("sha256", secret).update(body, "utf8").digest(),
  );
  return `${body}.${sig}`;
}

export type VerifyParadiseResult =
  | { ok: true; payload: ParadiseAttestationPayload }
  | { ok: false; reason: string };

export function verifyParadiseAttestation(
  token: string,
  secret: string,
  opts: { nowSec?: number } = {},
): VerifyParadiseResult {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, reason: "attestation vide" };

  const parts = trimmed.split(".");
  if (parts.length !== 2) {
    return { ok: false, reason: "format attestation invalide" };
  }
  const [body, sig] = parts as [string, string];
  if (!body || !sig) return { ok: false, reason: "format attestation invalide" };

  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  let got: Buffer;
  try {
    got = b64urlDecode(sig);
  } catch {
    return { ok: false, reason: "signature attestation illisible" };
  }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return { ok: false, reason: "HMAC attestation invalide" };
  }

  let payload: ParadiseAttestationPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "payload attestation illisible" };
  }

  if (payload.v !== 1) {
    return { ok: false, reason: "version attestation non supportée" };
  }
  if (payload.iss !== "cultivationparadise.com") {
    return { ok: false, reason: "issuer attestation invalide" };
  }
  if (payload.provider !== PARADISE_PROVIDER_NAME) {
    return { ok: false, reason: "provider attestation invalide" };
  }
  if (!isParadiseEnvelopeId(payload.envelopeId)) {
    return { ok: false, reason: "envelopeId Paradise invalide" };
  }
  if (
    payload.person !== "benjamin" &&
    payload.person !== "gabriel" &&
    payload.person !== "romain"
  ) {
    return { ok: false, reason: "person session Paradise invalide" };
  }
  if (!payload.signerEmail?.includes("@")) {
    return { ok: false, reason: "signerEmail manquant" };
  }
  if (!payload.signatureStrokeHash || payload.signatureStrokeHash.length < 16) {
    return { ok: false, reason: "signatureStrokeHash manquant" };
  }

  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    return { ok: false, reason: "attestation expirée" };
  }
  if (typeof payload.iat !== "number" || payload.iat > now + 60) {
    return { ok: false, reason: "iat attestation invalide" };
  }

  return { ok: true, payload };
}

export function artifactRefForAttestation(token: string): string {
  return `${PARADISE_ARTIFACT_SCHEME}${token}`;
}

export function attestationFromArtifactRef(
  ref: string | null | undefined,
): string | null {
  if (!ref?.startsWith(PARADISE_ARTIFACT_SCHEME)) return null;
  return ref.slice(PARADISE_ARTIFACT_SCHEME.length) || null;
}
