import { readFile, writeFile } from "node:fs/promises";

const [databaseId, outputPath] = process.argv.slice(2);
if (databaseId === undefined || outputPath === undefined) {
  throw new Error(
    "Usage: node scripts/prepare-production-config.mjs <d1-id> <output-path>",
  );
}

const config = await readFile("dist/ignis_snaps/wrangler.json", "utf8");
if (!config.includes("TEMPLATE_PROD_DB_ID")) {
  throw new Error(
    "Production D1 placeholder was not found in the built Wrangler config",
  );
}

await writeFile(outputPath, config.replace("TEMPLATE_PROD_DB_ID", databaseId));
