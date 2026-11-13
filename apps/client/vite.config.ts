import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Monorepo root — load root `.env` `VITE_*` (apps/client has no local .env). */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  // Workspace CJS named exports confuse Rollup — bundle TS source instead.
  resolve: {
    alias: {
      "@atlas/risk-table": path.resolve(
        repoRoot,
        "packages/risk-table/src/index.ts",
      ),
    },
  },
  // Bind IPv4+IPv6 so localhost and 127.0.0.1 both reach the client (Atlas.exe uses IPv4).
  server: { host: true, port: 3002 },
});
