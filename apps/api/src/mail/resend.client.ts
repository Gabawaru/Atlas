/**
 * Thin HTTP client for Resend emails API.
 * Base: https://api.resend.com — never hardcode the API key.
 */

export const RESEND_BASE_URL = "https://api.resend.com";
export const RESEND_USER_AGENT = "atlas/1.0";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ResendClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

export type ResendSendArgs = {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
};

export class ResendHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Resend HTTP ${status}: ${detail}`);
    this.name = "ResendHttpError";
  }
}

export class ResendClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: ResendClientOptions) {
    const key = opts.apiKey.trim();
    if (!key) {
      throw new Error("RESEND_API_KEY manquante");
    }
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl ?? RESEND_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /** POST /emails → { id } */
  async sendEmail(args: ResendSendArgs): Promise<{ id: string }> {
    if (!args.html && !args.text) {
      throw new Error("Resend : html ou text requis");
    }
    const body: Record<string, unknown> = {
      from: args.from,
      to: args.to,
      subject: args.subject,
    };
    if (args.html) body.html = args.html;
    if (args.text) body.text = args.text;
    if (args.replyTo) body.reply_to = args.replyTo;

    const res = await this.fetchImpl(`${this.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": RESEND_USER_AGENT,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = { message: text };
      }
    }
    if (!res.ok) {
      const detail =
        parsed &&
        typeof parsed === "object" &&
        parsed !== null &&
        "message" in parsed
          ? String((parsed as { message: unknown }).message)
          : text || res.statusText;
      throw new ResendHttpError(res.status, detail);
    }
    const id =
      parsed &&
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed
        ? String((parsed as { id: unknown }).id)
        : "";
    if (!id) {
      throw new ResendHttpError(res.status, "réponse sans id");
    }
    return { id };
  }
}
