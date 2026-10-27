/**
 * JWT HS256 secret — fail closed hors dev/ci.
 * OWASP A02 / Musk simplify : jamais de défaut silencieux en « prod ».
 */
const DEV_DEFAULT = "dev-only-change-me-not-a-real-secret";

const ALLOW_DEFAULT_ENVS = new Set(["development", "ci", "test"]);

export function resolveJwtSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const atlasEnv = (env.ATLAS_ENV ?? env.NODE_ENV ?? "development").toLowerCase();
  const secret = env.JWT_SECRET?.trim();
  const allowDefault = ALLOW_DEFAULT_ENVS.has(atlasEnv);

  if (!secret) {
    if (!allowDefault) {
      throw new Error(
        "JWT_SECRET is required when ATLAS_ENV is not development|ci|test",
      );
    }
    return DEV_DEFAULT;
  }

  if (secret === DEV_DEFAULT && !allowDefault) {
    throw new Error(
      "JWT_SECRET must not use the documented dev default outside development|ci|test",
    );
  }

  return secret;
}

export const JWT_DEV_DEFAULT_SECRET = DEV_DEFAULT;
