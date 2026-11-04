/**
 * HTTP client for Paradise Atlas authz endpoints (drawn signatures).
 * Base: ATLAS_PARADISE_AUTHZ_BASE_URL (default https://cultivationparadise.com)
 */
import {
  paradiseBaseUrl,
  type ParadiseAuthzRemote,
} from "./paradise-authz";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export const PARADISE_AUTHZ_USER_AGENT = "atlas/1.0";

export type ParadiseSignClientOptions = {
  baseUrl?: string;
  /** Shared HMAC secret — sent as X-Atlas-Paradise-Authz only when set. */
  secret?: string;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
};

export class ParadiseSignClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: ParadiseSignClientOptions = {}) {
    const env = opts.env ?? process.env;
    this.baseUrl = (opts.baseUrl ?? paradiseBaseUrl(env)).replace(/\/$/, "");
    this.secret = (opts.secret ?? env.ATLAS_PARADISE_AUTHZ_SECRET ?? "").trim();
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": PARADISE_AUTHZ_USER_AGENT,
    };
    if (this.secret) {
      h["X-Atlas-Paradise-Authz"] = this.secret;
    }
    return h;
  }

  /** GET /api/atlas/authz/:id — poll drawn-signature envelope. */
  async getAuthz(envelopeId: string): Promise<ParadiseAuthzRemote> {
    const id = encodeURIComponent(envelopeId.trim());
    const res = await this.fetchImpl(`${this.baseUrl}/api/atlas/authz/${id}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`Paradise authz HTTP ${res.status}`);
    }
    return (await res.json()) as ParadiseAuthzRemote;
  }

  /**
   * POST /api/atlas/authz — open a pending draw session (optional).
   * Body: { documentHash, signerLabel?, purpose?, targetHosts? }
   */
  async createAuthz(body: {
    documentHash: string;
    signerLabel?: string;
    purpose?: string;
    targetHosts?: string[];
  }): Promise<ParadiseAuthzRemote> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/atlas/authz`, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Paradise authz create HTTP ${res.status}`);
    }
    return (await res.json()) as ParadiseAuthzRemote;
  }
}
