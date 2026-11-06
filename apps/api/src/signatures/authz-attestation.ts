/**
 * Resolve signed-authz for real / aggressive runs.
 *
 * Order:
 * 1. Pragma Sign poll when PRAGMA_SIGN_API_KEY set
 * 2. Local/dev ATLAS_AUTHZ=signed only (Policy Guard / RoE)
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

  // 1) Pragma Sign
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

  // 2) Local / CI / dev without Sign — operator attestation only.
  return isSignedAuthzAttested(env);
}
