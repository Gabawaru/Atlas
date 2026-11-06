import { Global, Module } from "@nestjs/common";
import { SIGNATURE_PROVIDER } from "./signature-provider";
import { MockSignatureProvider } from "./mock-signature.provider";
import { PragmaSignSignatureProvider } from "./pragma-sign.provider";

/**
 * Provider selection:
 * 1. ATLAS_SIGNATURE_PROVIDER=pragma | mock — explicit override
 * 2. Else Pragma Sign when PRAGMA_SIGN_API_KEY set
 * 3. Else mock (CI / démo)
 */
function createSignatureProvider() {
  const forced = (process.env.ATLAS_SIGNATURE_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  const pragmaKey = (process.env.PRAGMA_SIGN_API_KEY ?? "").trim();

  if (forced === "pragma") {
    if (!pragmaKey) {
      throw new Error(
        "ATLAS_SIGNATURE_PROVIDER=pragma requires PRAGMA_SIGN_API_KEY",
      );
    }
    return new PragmaSignSignatureProvider({ apiKey: pragmaKey });
  }
  if (forced === "mock") {
    return new MockSignatureProvider();
  }

  if (pragmaKey) {
    return new PragmaSignSignatureProvider({ apiKey: pragmaKey });
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
