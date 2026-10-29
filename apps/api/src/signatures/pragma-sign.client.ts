/**
 * Thin HTTP client for Pragma Sign (PS-1) partner signatures API.
 * Base: https://agent-api.pragma-serve.com — never hardcode the API key.
 */

export const PRAGMA_SIGN_BASE_URL = "https://agent-api.pragma-serve.com";
export const PRAGMA_SIGN_USER_AGENT = "atlas/1.0";

export type PragmaSignApiStatus =
  | "pending"
  | "viewed"
  | "signed"
  | "refused"
  | "expired"
  | "cancelled";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type PragmaSignClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

export class PragmaSignHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Pragma Sign HTTP ${status}: ${detail}`);
    this.name = "PragmaSignHttpError";
  }
}

export class PragmaSignClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: PragmaSignClientOptions) {
    const key = opts.apiKey.trim();
    if (!key) {
      throw new Error("PRAGMA_SIGN_API_KEY manquante");
    }
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl ?? PRAGMA_SIGN_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      "User-Agent": PRAGMA_SIGN_USER_AGENT,
      Accept: "application/json",
    };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = { detail: text };
      }
    }
    if (!res.ok) {
      const detail =
        parsed &&
        typeof parsed === "object" &&
        parsed !== null &&
        "detail" in parsed
          ? String((parsed as { detail: unknown }).detail)
          : text || res.statusText;
      throw new PragmaSignHttpError(res.status, detail);
    }
    return parsed as T;
  }

  /** POST /v1/partner/signatures/documents → { id } */
  async createDocument(title: string, bodyHtml: string): Promise<{ id: number }> {
    return this.request<{ id: number }>(
      "POST",
      "/v1/partner/signatures/documents",
      { title, body_html: bodyHtml },
    );
  }

  /** POST /v1/partner/signatures/request */
  async requestSignature(args: {
    docId: number;
    signerEmail: string;
    signerName: string;
  }): Promise<{
    id: string;
    token: string;
    sign_url: string;
    status: PragmaSignApiStatus;
    expires_at: string;
  }> {
    return this.request("POST", "/v1/partner/signatures/request", {
      doc_type: "document",
      doc_id: args.docId,
      signer_email: args.signerEmail,
      signer_name: args.signerName,
    });
  }

  /** GET /v1/partner/signatures/{id} */
  async getEnvelope(id: string): Promise<{
    signature: {
      id: number | string;
      status: PragmaSignApiStatus;
      signer_email?: string;
      signer_name?: string;
      [key: string]: unknown;
    };
    events?: unknown[];
  }> {
    return this.request("GET", `/v1/partner/signatures/${encodeURIComponent(id)}`);
  }

  async getSignatureStatus(id: string): Promise<PragmaSignApiStatus> {
    const env = await this.getEnvelope(id);
    return env.signature.status;
  }
}

export function mapPragmaStatusToSignatureStatus(
  status: PragmaSignApiStatus,
): "pending" | "signed" | "declined" | "expired" {
  switch (status) {
    case "signed":
      return "signed";
    case "expired":
      return "expired";
    case "refused":
    case "cancelled":
      return "declined";
    case "pending":
    case "viewed":
    default:
      return "pending";
  }
}

export function mapPragmaStatusToAuthz(
  status: PragmaSignApiStatus,
): "signed" | "pending" | "rejected" {
  switch (status) {
    case "signed":
      return "signed";
    case "refused":
    case "cancelled":
      return "rejected";
    default:
      return "pending";
  }
}
