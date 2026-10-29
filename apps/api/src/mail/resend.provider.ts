/**
 * MailProvider backed by Resend.
 * Requires RESEND_API_KEY (env) — never hardcode.
 */
import {
  ResendClient,
  type FetchLike,
} from "./resend.client";
import type {
  MailProvider,
  SendMailInput,
  SendMailResult,
} from "./mail-provider";

export type ResendMailProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  client?: ResendClient;
};

export class ResendMailProvider implements MailProvider {
  readonly name = "resend";

  private readonly client: ResendClient;

  constructor(opts: ResendMailProviderOptions) {
    this.client =
      opts.client ??
      new ResendClient({
        apiKey: opts.apiKey,
        baseUrl: opts.baseUrl,
        fetchImpl: opts.fetchImpl,
      });
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    const to = Array.isArray(input.to) ? input.to : [input.to];
    const { id } = await this.client.sendEmail({
      from: input.from,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    return { id, provider: this.name, isMock: false };
  }
}
