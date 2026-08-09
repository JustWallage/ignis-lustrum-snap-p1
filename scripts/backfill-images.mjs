import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { backfillImages, describe } from "./backfill.mjs";

const args = process.argv.slice(2);
const configIndex = args.indexOf("--config");
const configPath = configIndex >= 0 ? args[configIndex + 1] : undefined;
if (configPath === undefined) {
  throw new Error("--config <prepared wrangler config> is required");
}
const config = JSON.parse(await readFile(configPath, "utf8"));
const bucket = config.r2_buckets?.[0]?.bucket_name;
if (bucket === undefined) {
  throw new Error(`${configPath} declares no r2_buckets`);
}

function wrangler(argv, input) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...argv], {
    input,
    maxBuffer: 512 * 1024 * 1024,
    encoding: input === undefined ? "utf8" : "buffer",
  });
  if (result.status !== 0) {
    process.stderr.write(String(result.stderr ?? ""));
    throw new Error(`wrangler ${argv[0]} ${argv[1]} failed`);
  }
  return result.stdout;
}

function query(sql) {
  const out = wrangler([
    "d1",
    "execute",
    "DB",
    "--remote",
    "--json",
    "-y",
    "-c",
    configPath,
    "--command",
    sql,
  ]);
  return JSON.parse(out)[0]?.results ?? [];
}

const PAGE = 10;

function readPaged(table, columns, where) {
  return async () => {
    const ids = query(`SELECT id FROM ${table} ${where} ORDER BY id`).map(
      (row) => row.id,
    );
    const rows = [];
    for (let at = 0; at < ids.length; at += PAGE) {
      const page = ids.slice(at, at + PAGE).join(",");
      rows.push(
        ...query(`SELECT ${columns} FROM ${table} WHERE id IN (${page})`),
      );
    }
    return rows;
  };
}

const result = await backfillImages({
  hasByteColumns: () =>
    query("SELECT name FROM pragma_table_info('photos')").some(
      (row) => row.name === "data",
    ),
  readPhotos: readPaged("photos", "id, data, content_type", ""),
  readUsers: readPaged(
    "users",
    "avatar, avatar_content_type, avatar_key",
    "WHERE avatar IS NOT NULL",
  ),
  put: (object) => {
    wrangler(
      [
        "r2",
        "object",
        "put",
        `${bucket}/${object.key}`,
        "--remote",
        "--pipe",
        "--content-type",
        object.contentType,
        "-c",
        configPath,
      ],
      Buffer.from(object.base64, "base64"),
    );
  },
});

console.log(describe(result));
