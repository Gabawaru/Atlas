import "reflect-metadata";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

/** Default CORS: Vite client + admin + Atlas.exe Scan shell (:17865) on localhost/127.0.0.1. */
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:17865",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3002",
  "http://127.0.0.1:17865",
].join(",");

/**
 * Load root monorepo `.env` into process.env without overriding existing keys.
 * `pnpm --filter @atlas/api` often runs with cwd=apps/api; AtlasLocal uses repo root.
 */
function loadRootEnv(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(__dirname, "../../../.env"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] !== undefined) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
    break;
  }
}

async function bootstrap() {
  loadRootEnv();
  const app = await NestFactory.create(AppModule);
  // Union configured CORS with local loopback defaults so Gab `.env` that only
  // lists localhost still accepts Atlas.exe / Vite on 127.0.0.1:3002.
  const origins = [
    ...new Set(
      `${process.env.CORS_ORIGINS ?? ""},${DEFAULT_CORS_ORIGINS}`
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix("v1");
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Atlas API listening on http://localhost:${port}/v1`);
}

bootstrap();
