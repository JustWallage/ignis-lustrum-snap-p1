import { defineConfig } from "vitest/config";

// The build scripts are plain Node ESM, so they cannot ride in the workers pool
// alongside worker/ and shared/. backlog.mjs is the one that needs covering:
// it arbitrates which ticket each parallel agent picks up, and when it is wrong
// the whole backlog silently stalls rather than failing loudly.
export default defineConfig({
  test: {
    name: "scripts",
    environment: "node",
    include: ["scripts/**/*.test.mjs"],
  },
});
