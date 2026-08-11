import { z } from "zod";
import { expect, test } from "./fixtures";

// The dev server and the deployed Worker need not spell a content-type the same
// way, so match a family, never a string: an equality green locally and red in the
// pipeline is worse than no assertion. What separates a served manifest from
// `index.html` falling out of `not_found_handling` is that it is JSON at all.
const JSON_TYPE = /json/i;
const JS_TYPE = /javascript/i;

// Parsed with a schema declared HERE, not in `shared/`: a schema only the e2e
// project imports is dead code to knip and a red `pnpm check`. It also types the
// icon list out of `any`, which strict lint forbids reaching into.
const manifestSchema = z.object({
  name: z.string().min(1),
  display: z.string(),
  start_url: z.string(),
  icons: z.array(z.object({ src: z.string(), sizes: z.string() })).min(1),
});

test("the manifest is served as a manifest, not index.html", async ({
  page,
}) => {
  const res = await page.request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"] ?? "").toMatch(JSON_TYPE);
  const manifest = manifestSchema.parse(JSON.parse(await res.text()));
  expect(manifest.display).toBe("standalone");
});

test("every manifest icon decodes in the browser at its declared size", async ({
  page,
}) => {
  const res = await page.request.get("/manifest.webmanifest");
  const { icons } = manifestSchema.parse(JSON.parse(await res.text()));
  await page.goto("/");
  const decoded = await page.evaluate(
    (list) =>
      Promise.all(
        list.map(async (icon) => {
          const iconRes = await fetch(icon.src);
          // createImageBitmap rejects a truncated or non-image body, so a 200 that
          // is secretly `index.html` cannot pass as a decoded icon.
          const bitmap = await createImageBitmap(await iconRes.blob());
          return {
            status: iconRes.status,
            sizes: icon.sizes,
            width: bitmap.width,
            height: bitmap.height,
          };
        }),
      ),
    icons,
  );
  for (const icon of decoded) {
    expect(icon.status).toBe(200);
    const [declaredW, declaredH] = icon.sizes.split("x").map(Number);
    expect(icon.width).toBe(declaredW);
    expect(icon.height).toBe(declaredH);
  }
});

test("the service worker is served as JavaScript and reaches activated", async ({
  page,
}) => {
  const res = await page.request.get("/sw.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"] ?? "").toMatch(JS_TYPE);

  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return reg?.active?.state ?? "none";
      }),
    )
    .toBe("activated");
});

test("the document links the served manifest with no crossorigin", async ({
  page,
}) => {
  await page.goto("/");
  const link = await page.evaluate(() => {
    const el = document.querySelector('link[rel="manifest"]');
    return el === null
      ? null
      : {
          href: el.getAttribute("href"),
          crossorigin: el.getAttribute("crossorigin"),
        };
  });
  expect(link?.href).toBe("/manifest.webmanifest");
  // Cloudflare Access would bounce the cookieless manifest fetch to a login, forcing
  // crossorigin; Ignis provisions no Access and walking is public, so its absence is
  // deliberate — this pins it.
  expect(link?.crossorigin).toBeNull();
});
