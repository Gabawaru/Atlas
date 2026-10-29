/**
 * Resolve signed-authz for real / aggressive runs.
 *
 * Prefer: when PRAGMA_SIGN_API_KEY is set, poll Pragma Sign for envelope status === signed.
 * Fallback (local/dev, no key): ATLAS_AUTHZ=signed only.
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
 * @returns true iff a verified signed envelope or local/dev ATLAS_AUTHZ=signed.
 */
export async function resolveSignedAuthzAttested(
  opts: ResolveSignedAuthzOpts = {},
): Promise<boolean> {
  const env = opts.env ?? process.env;
  const key = (env.PRAGMA_SIGN_API_KEY ?? "").trim();

  if (key) {
    const envelopeId = opts.envelopeId?.trim();
    if (!envelopeId) {
      // Key present but nothing to poll — fail-closed (no ATLAS_AUTHZ bypass with live key).
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

  // Local / CI / dev without Sign API key — documented operator attestation only.
  return isSignedAuthzAttested(env);
}
