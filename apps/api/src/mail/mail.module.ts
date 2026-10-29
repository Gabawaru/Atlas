import { Global, Module } from "@nestjs/common";
import { MAIL_PROVIDER } from "./mail-provider";
import { MockMailProvider } from "./mock-mail.provider";
import { ResendMailProvider } from "./resend.provider";

export function createMailProvider() {
  const key = (process.env.RESEND_API_KEY ?? "").trim();
  if (key) {
    return new ResendMailProvider({ apiKey: key });
  }
  return new MockMailProvider();
}

@Global()
@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      useFactory: () => createMailProvider(),
    },
  ],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}
