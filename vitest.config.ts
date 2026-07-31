import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    // Three projects, split by runtime rather than by folder: the workers pool
    // for worker/ + shared/, plain Node for pure front-end logic under src/
    // (palettes, the dialogue state machine), and plain Node for the build
    // scripts, which are ESM .mjs and need none of the app's aliases. Anything
    // needing a DOM is covered end to end by Playwright, on the real Game Boy
    // buttons — do not add a project that re-includes src/**/*.test.ts, or
    // those files run twice, once without the aliases.
    projects: [
      "./vitest.workers.config.ts",
      "./vitest.app.config.ts",
      "./vitest.scripts.config.ts",
    ],
  },
});
