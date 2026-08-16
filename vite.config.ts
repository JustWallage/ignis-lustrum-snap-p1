import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `pnpm test:e2e` runs one whole app per Playwright worker, and this directory is the
// ONLY thing that keeps two of them apart: miniflare's D1, R2 and Durable Object state
// all live under it. The inspector has to go with it — every instance otherwise binds
// the same 9229 and workerd dies on the second, taking that shard's server with it.
const persistPath = process.env.E2E_PERSIST_PATH;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(
      persistPath === undefined
        ? {}
        : { persistState: { path: persistPath }, inspectorPort: false },
    ),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
