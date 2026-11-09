/**
 * Resolve signed-authz for real / aggressive runs.
 *
 * Order:
 * 1. If an envelope id is present and PRAGMA_SIGN_API_KEY set → poll Sign
 * 2. Else ATLAS_AUTHZ=signed (operator liability checkbox path — no Sign required)
 *
 * Product gate for real scans is the responsibility checkbox + Policy Guard / RoE.
 * A present Sign API key alone must not block that path.
 */
import { isSignedAuthzAttested } from "@atlas/policy-guard";
import {
  PragmaSignClient,
  type FetchLike,
} from "./pragma-sign.client";

export type ResolveSignedAuthzOpts = {
  envelopeId?: string | null;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  /** Injected client (tests). */
  client?: PragmaSignClient;
};

/**
 * @returns true iff a verified Pragma signed envelope or local ATLAS_AUTHZ=signed.
 */
export async function resolveSignedAuthzAttested(
  opts: ResolveSignedAuthzOpts = {},
): Promise<boolean> {
  const env = opts.env ?? process.env;
  const envelopeId = opts.envelopeId?.trim() ?? "";

  // 1) Optional Pragma Sign poll only when an envelope was attached
  const key = (env.PRAGMA_SIGN_API_KEY ?? "").trim();
  if (key && envelopeId) {
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

  // 2) Operator liability / local-dev attestation (Policy Guard + RoE still apply)
  return isSignedAuthzAttested(env);
}
