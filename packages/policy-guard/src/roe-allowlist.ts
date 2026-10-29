/**
 * Platform RoE host allowlist — Atlas authorized-pentest scope.
 * Source: docs/atlas-pentest-scope-roe.md (sections 3–5).
 * Fail-closed: unknown / gated hosts REJECT unless explicit override.
 */

/** Wildcard patterns (section 4): any label under these apexes. */
export const ROE_ALLOWED_HOST_PATTERNS = [
  "*.pragma-cloud.com",
  "*.pragma-serve.com",
  "*.pragma.mc",
] as const;

/**
 * Explicit in-scope hosts (section 3) — includes apexes not covered by `*.`
 * (e.g. pragma-serve.com). Subdomains under the patterns are also covered.
 */
export const ROE_ALLOWED_HOSTS_EXPLICIT = [
  "pragma-serve.com",
  "console.pragma-serve.com",
  "api.pragma-serve.com",
  "web.pragma-serve.com",
  "ai.pragma-cloud.com",
  "gtm.pragma-cloud.com",
  "gtm-pragma-mc.pragma-cloud.com",
  "pragmamc-crm.pragma-cloud.com",
  "pragmamc.pragma-cloud.com",
  "sign.pragma.mc",
  "drive.pragma.mc",
  "bc.pragma.mc",
  "equipe.pragma.mc",
] as const;

/**
 * Gated client / brand domains (section 5) — REJECT by default until
 * written client authorization + operator override.
 * Matched as exact host or any subdomain of the apex.
 */
export const ROE_GATED_HOSTS = [
  "bussignydunkers.ch",
  "cepmonaco.com",
  "lechoeurdusud.com",
  "lechoeurgospelstory.fr",
  "maison-velanza.com",
  "mikra.fr",
  "scriptur.fr",
  "flash-studio.app",
  "quirel.com",
  "romaingirardi.com",
  "thepromisemonaco.com",
] as const;

export type RoeHostRejectCode = "TARGET_GATED" | "TARGET_OUT_OF_SCOPE";

export type RoeHostEvaluation = {
  decision: "ALLOW" | "REJECT";
  code?: RoeHostRejectCode;
  reason: string;
  /** Normalized hostname evaluated */
  host: string;
};

export type RoeHostEvaluateOptions = {
  /** Explicit operator override — required to target gated / out-of-scope hosts */
  override?: boolean;
};

/** Normalize hostname / URL to lowercase FQDN without trailing dot or port. */
export function normalizeRoeHost(value: string): string {
  const raw = value.trim();
  try {
    if (raw.includes("://")) {
      return new URL(raw).hostname.toLowerCase().replace(/\.$/, "");
    }
  } catch {
    /* fallthrough */
  }
  let host = raw.toLowerCase().replace(/\.$/, "").split("/")[0] ?? "";
  // Strip :port on IPv4/hostname (leave bare IPv6 alone — rejected later)
  if (host.includes(":") && !host.includes("::")) {
    host = host.split(":")[0] ?? host;
  }
  return host;
}

function hostMatchesApexOrExact(host: string, apex: string): boolean {
  return host === apex || host.endsWith(`.${apex}`);
}

/** True if host matches `*.apex` (subdomain only, not the apex itself). */
function hostMatchesWildcardPattern(host: string, pattern: string): boolean {
  if (!pattern.startsWith("*.")) return false;
  const suffix = pattern.slice(1); // ".apex.tld"
  return host.endsWith(suffix) && host.length > suffix.length;
}

export function isRoeGatedHost(host: string): boolean {
  const h = normalizeRoeHost(host);
  if (!h) return false;
  return ROE_GATED_HOSTS.some((g) => hostMatchesApexOrExact(h, g));
}

export function isRoeInScopeHost(host: string): boolean {
  const h = normalizeRoeHost(host);
  if (!h || h.includes(" ") || h.includes("..")) return false;
  if (ROE_ALLOWED_HOSTS_EXPLICIT.some((e) => h === e)) return true;
  return ROE_ALLOWED_HOST_PATTERNS.some((p) =>
    hostMatchesWildcardPattern(h, p),
  );
}

/**
 * Env override for RoE platform allowlist (ops / signed go).
 * ATLAS_ROE_SCOPE_OVERRIDE=1|true unlocks gated / out-of-scope targets.
 */
export function isRoeScopeOverrideEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  inputOverride?: boolean,
): boolean {
  if (inputOverride === true) return true;
  const v = env.ATLAS_ROE_SCOPE_OVERRIDE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Evaluate one host against the platform RoE allowlist.
 * Order: invalid → gated (unless override) → in-scope patterns → reject.
 */
export function evaluateRoeHost(
  host: string,
  opts: RoeHostEvaluateOptions = {},
): RoeHostEvaluation {
  const h = normalizeRoeHost(host);
  if (!h || h.includes(" ") || h.includes("..") || h.includes(":")) {
    return {
      decision: "REJECT",
      code: "TARGET_OUT_OF_SCOPE",
      reason: `Hôte invalide « ${host} » — refus RoE plateforme.`,
      host: h,
    };
  }

  if (isRoeGatedHost(h)) {
    if (opts.override) {
      return {
        decision: "ALLOW",
        reason: `Cible gated « ${h} » autorisée via override RoE.`,
        host: h,
      };
    }
    return {
      decision: "REJECT",
      code: "TARGET_GATED",
      reason: `Cible gated « ${h} » — domaine client / marque exclu jusqu'à autorisation écrite + override.`,
      host: h,
    };
  }

  if (isRoeInScopeHost(h)) {
    return {
      decision: "ALLOW",
      reason: `Cible « ${h} » dans le périmètre RoE plateforme.`,
      host: h,
    };
  }

  if (opts.override) {
    return {
      decision: "ALLOW",
      reason: `Cible hors périmètre RoE « ${h} » autorisée via override.`,
      host: h,
    };
  }

  return {
    decision: "REJECT",
    code: "TARGET_OUT_OF_SCOPE",
    reason: `Cible « ${h} » hors périmètre RoE plateforme — refus (override requis).`,
    host: h,
  };
}

/** Evaluate many hosts; first REJECT wins (fail-closed). */
export function evaluateRoeHosts(
  hosts: string[],
  opts: RoeHostEvaluateOptions = {},
): RoeHostEvaluation {
  if (hosts.length === 0) {
    return {
      decision: "REJECT",
      code: "TARGET_OUT_OF_SCOPE",
      reason:
        "Aucune cible déclarée pour contrôle RoE plateforme — refus fail-closed.",
      host: "",
    };
  }
  for (const host of hosts) {
    const r = evaluateRoeHost(host, opts);
    if (r.decision === "REJECT") return r;
  }
  return {
    decision: "ALLOW",
    reason: "Toutes les cibles sont dans le périmètre RoE plateforme.",
    host: normalizeRoeHost(hosts[0]!),
  };
}
