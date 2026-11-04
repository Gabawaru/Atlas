/**
 * Resolve signed-authz for real / aggressive runs.
 *
 * Order (P0 — no wait on Pragma Sign key):
 * 1. Paradise HMAC attestation / poll when ATLAS_PARADISE_AUTHZ_SECRET set
 * 2. Pragma Sign poll when PRAGMA_SIGN_API_KEY set
 * 3. Local/dev ATLAS_AUTHZ=signed only
 */
import { isSignedAuthzAttested } from "@atlas/policy-guard";
import {
  isParadiseAuthzConfigured,
  isParadiseEnvelopeId,
  verifyParadiseAttestation,
} from "./paradise-authz";
import {
  ParadiseSignClient,
  type FetchLike as ParadiseFetchLike,
} from "./paradise-sign.client";
import {
  PragmaSignClient,
  type FetchLike,
} from "./pragma-sign.client";

export type ResolveSignedAuthzOpts = {
  envelopeId?: string | null;
  /** Compact Paradise attestation token (optional — if present, verify directly). */
  paradiseAttestation?: string | null;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  paradiseFetchImpl?: ParadiseFetchLike;
  /** Injected client (tests). */
  client?: PragmaSignClient;
  paradiseClient?: ParadiseSignClient;
};

/**
 * @returns true iff a verified Paradise/Pragma signed envelope or local ATLAS_AUTHZ=signed.
 */
export async function resolveSignedAuthzAttested(
  opts: ResolveSignedAuthzOpts = {},
): Promise<boolean> {
  const env = opts.env ?? process.env;
  const envelopeId = opts.envelopeId?.trim() ?? "";
  const paradiseSecret = (env.ATLAS_PARADISE_AUTHZ_SECRET ?? "").trim();

  // 1) Paradise — prefer when secret present (P0 path)
  if (isParadiseAuthzConfigured(env)) {
    const inline = opts.paradiseAttestation?.trim();
    if (inline) {
      const v = verifyParadiseAttestation(inline, paradiseSecret);
      return v.ok && v.payload.status === "signed";
    }
    if (!envelopeId) {
      // Secret present but nothing to verify — fail-closed (no ATLAS_AUTHZ theater).
      return false;
    }
    if (isParadiseEnvelopeId(envelopeId) || !((env.PRAGMA_SIGN_API_KEY ?? "").trim())) {
      try {
        const client =
          opts.paradiseClient ??
          new ParadiseSignClient({
            secret: paradiseSecret,
            fetchImpl: opts.paradiseFetchImpl,
            env,
          });
        const remote = await client.getAuthz(envelopeId);
        if (remote.status !== "signed") return false;
        if (remote.attestation) {
          const v = verifyParadiseAttestation(
            remote.attestation,
            paradiseSecret,
          );
          return v.ok && v.payload.status === "signed";
        }
        // Remote claims signed without attestation token — accept only if
        // stroke hash present (Paradise worker contract).
        return Boolean(
          remote.signatureStrokeHash &&
            remote.signatureStrokeHash.length >= 16 &&
            remote.person,
        );
      } catch {
        return false;
      }
    }
  }

  // 2) Pragma Sign
  const key = (env.PRAGMA_SIGN_API_KEY ?? "").trim();
  if (key) {
    if (!envelopeId) {
      return false;
    }
    try {
      const client =
        opts.client ??
        new PragmaSignClient({
          apiKey: key,
          fetchImpl: opts.fetchImpl,
        });
      const status = await client.getSignatureStatus(envelopeId);
      return status === "signed";
    } catch {
      return false;
    }
  }

  // 3) Local / CI / dev without Paradise or Sign — operator attestation only.
  return isSignedAuthzAttested(env);
}
