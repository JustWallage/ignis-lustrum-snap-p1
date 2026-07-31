import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations("db/migrations");
      return {
        main: "./worker/index.ts",
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            // Fixed test values; individual tests seed users through the login
            // flow using these. Four of them, because a full ballot ranks three
            // OTHER people's snaps, and the voter's own is on it as well.
            JWT_SECRET: "unit-test-secret",
            USERS_JSON: JSON.stringify([
              { name: "tester", password: "test-password-123" },
              { name: "rival", password: "rival-password-123" },
              { name: "voter", password: "voter-password-123" },
              { name: "judge", password: "judge-password-123" },
            ]),
            ADMIN_NAMES: "tester",
            // Applied to the fresh per-file D1 by worker/test-setup.ts.
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    name: "worker",
    // shared/ is runtime-agnostic, so its unit tests ride along in the same pool
    // rather than justifying a second vitest project.
    include: ["worker/**/*.test.ts", "shared/**/*.test.ts"],
    setupFiles: ["./worker/test-setup.ts"],
  },
});
