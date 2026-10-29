import { Global, Module } from "@nestjs/common";
import { SIGNATURE_PROVIDER } from "./signature-provider";
import { MockSignatureProvider } from "./mock-signature.provider";
import { PragmaSignSignatureProvider } from "./pragma-sign.provider";

function createSignatureProvider() {
  const key = (process.env.PRAGMA_SIGN_API_KEY ?? "").trim();
  if (key) {
    return new PragmaSignSignatureProvider({ apiKey: key });
  }
  return new MockSignatureProvider();
}

@Global()
@Module({
  providers: [
    {
      provide: SIGNATURE_PROVIDER,
      useFactory: () => createSignatureProvider(),
    },
  ],
  exports: [SIGNATURE_PROVIDER],
})
export class SignaturesModule {}
