import { Global, Module } from "@nestjs/common";
import { SIGNATURE_PROVIDER } from "./signature-provider";
import { MockSignatureProvider } from "./mock-signature.provider";
import { PragmaSignSignatureProvider } from "./pragma-sign.provider";
import { ParadiseSignSignatureProvider } from "./paradise-sign.provider";
import { isParadiseAuthzConfigured } from "./paradise-authz";

/**
 * Provider selection (P0):
 * 1. ATLAS_SIGNATURE_PROVIDER=paradise | pragma | mock — explicit override
 * 2. Else Paradise when ATLAS_PARADISE_AUTHZ_SECRET set (Ben: no wait on Sign key)
 * 3. Else Pragma Sign when PRAGMA_SIGN_API_KEY set
 * 4. Else mock (CI / démo)
 */
function createSignatureProvider() {
  const forced = (process.env.ATLAS_SIGNATURE_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  const paradiseSecret = (process.env.ATLAS_PARADISE_AUTHZ_SECRET ?? "").trim();
  const pragmaKey = (process.env.PRAGMA_SIGN_API_KEY ?? "").trim();

  if (forced === "paradise") {
    if (!paradiseSecret) {
      throw new Error(
        "ATLAS_SIGNATURE_PROVIDER=paradise requires ATLAS_PARADISE_AUTHZ_SECRET",
      );
    }
    return new ParadiseSignSignatureProvider({ secret: paradiseSecret });
  }
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

  if (isParadiseAuthzConfigured()) {
    return new ParadiseSignSignatureProvider({ secret: paradiseSecret });
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
