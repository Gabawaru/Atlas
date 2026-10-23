import type { SoftwareIdentity } from "./types";

/**
 * Extrait des identités logicielles depuis une bannière Server HTTP.
 * Passif uniquement — pas de fingerprinting actif.
 */
export function parseServerBanner(server?: string | null): SoftwareIdentity[] {
  if (!server || !server.trim()) return [];
  const out: SoftwareIdentity[] = [];
  const raw = server.trim();

  // nginx/1.14.0, Apache/2.4.41, OpenSSL/1.0.2k (souvent dans Server ou Via)
  const re =
    /\b(nginx|apache|openssl|iis|jetty|tomcat|node\.js|express)\/([0-9]+(?:\.[0-9]+){0,3}[a-z0-9-]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].toLowerCase().replace("node.js", "nodejs");
    out.push({
      name: name === "apache" ? "httpd" : name,
      version: m[2],
      ecosystem: name === "openssl" ? "openssl" : name === "nginx" ? "nginx" : "generic",
      rawEvidence: raw,
    });
  }

  // atlas-synthetic/1.0 — démo : pas de CVE (identité low confidence seulement)
  if (/atlas-synthetic\/([\w.-]+)/i.test(raw) && out.length === 0) {
    const ver = raw.match(/atlas-synthetic\/([\w.-]+)/i)?.[1] ?? "1.0";
    out.push({
      name: "atlas-synthetic",
      version: ver,
      ecosystem: "generic",
      rawEvidence: raw,
    });
  }

  return out;
}

export function normalizePackageKey(name: string, version: string): string {
  return `${name.toLowerCase().trim()}@${version.trim()}`;
}
