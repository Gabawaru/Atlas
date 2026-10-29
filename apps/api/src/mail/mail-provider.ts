/**
 * MailProvider pluggable — Resend when RESEND_API_KEY is set; else mock (CI / démo).
 */

export type SendMailInput = {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
};

export type SendMailResult = {
  id: string;
  provider: string;
  /** true = mock / stub — pas un envoi Resend réel */
  isMock: boolean;
};

export interface MailProvider {
  readonly name: string;
  send(input: SendMailInput): Promise<SendMailResult>;
}

export const MAIL_PROVIDER = Symbol("MAIL_PROVIDER");
