import path from "node:path";
import { defineConfig } from "vitest/config";

// Frontend unit tests. Anything under src/ that is pure logic (palettes, day
// arithmetic, scoring helpers) belongs here; it runs in plain Node, so a module
// that reaches for `document` needs a browser-like environment adding first.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    name: "app",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
