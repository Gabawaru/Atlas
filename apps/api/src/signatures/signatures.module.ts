import { Global, Module } from "@nestjs/common";
import { SIGNATURE_PROVIDER } from "./signature-provider";
import { MockSignatureProvider } from "./mock-signature.provider";

@Global()
@Module({
  providers: [
    {
      provide: SIGNATURE_PROVIDER,
      useFactory: () => new MockSignatureProvider(),
    },
  ],
  exports: [SIGNATURE_PROVIDER],
})
export class SignaturesModule {}
