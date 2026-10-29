import { randomUUID } from "node:crypto";
import type {
  MailProvider,
  SendMailInput,
  SendMailResult,
} from "./mail-provider";

/**
 * Mock pluggable — no network. Use Resend (RESEND_API_KEY) for real send.
 */
export class MockMailProvider implements MailProvider {
  readonly name = "mock";

  async send(_input: SendMailInput): Promise<SendMailResult> {
    return {
      id: `mock-mail-${randomUUID()}`,
      provider: this.name,
      isMock: true,
    };
  }
}
