import { photoSchema } from "../shared/api";
import { SPAWN } from "../shared/map";
import { gameStateSchema } from "../shared/state";
import {
  apiSignIn,
  expect,
  pressStart,
  test,
  TINY_PNG,
  walk,
} from "./fixtures";

test("the day and its submission count are public; the snaps behind them are not", async ({
  page,
}) => {
  await apiSignIn(page);
  const upload = await page.request.post("/api/photos", {
    multipart: {
      photo: { name: "snap.png", mimeType: "image/png", buffer: TINY_PNG },
    },
  });
  expect(upload.status()).toBe(201);
  const { id } = photoSchema.parse(await upload.json());
  await page.context().clearCookies();

  const state = await page.request.get("/api/state");
  expect(state.status()).toBe(200);
  expect(gameStateSchema.parse(await state.json())).toEqual({
    day: 1,
    phase: "submission",
    submissionCount: 1,
  });
  expect((await page.request.get("/api/map")).status()).not.toBe(200);
  expect((await page.request.get(`/api/photos/${id}`)).status()).toBe(401);
  expect((await page.request.get(`/api/photos/${id}/image`)).status()).toBe(
    401,
  );

  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");
  await walk(page, "ArrowDown", SPAWN.x, SPAWN.y + 1);
  await walk(page, "ArrowUp", SPAWN.x, SPAWN.y);
  await page.keyboard.press("Enter");
  await expect(page.locator(".gb-window")).toBeHidden();
  await expect(page.getByTestId("dialogue-text")).toBeHidden();
});
