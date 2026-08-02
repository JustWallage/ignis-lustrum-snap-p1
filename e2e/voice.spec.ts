import type { Locator, Page } from "@playwright/test";
import {
  apiSignIn,
  audioLog,
  boxOf,
  chirps,
  dropSocket,
  expect,
  joinAs,
  pressStart,
  readEvent,
  recordAudio,
  recordSockets,
  setPhase,
  test,
  voices,
} from "./fixtures";

const PHONE = { width: 390, height: 844 };

async function boxOfShell(page: Page) {
  const box = await page.locator(".gb-shell").boundingBox();
  if (box === null) throw new Error("the shell is not on screen");
  return box;
}

function lamp(page: Page, which: "voice-mine" | "voice-theirs"): Locator {
  return page.getByTestId(which).locator(".gb-led");
}

async function holdBar(page: Page): Promise<void> {
  await page.getByTestId("ptt-bar").hover();
  await page.mouse.down();
}

/** A hold puts the pointer on the shell, and a hovered dialogue choice is a selected
 * one — so every release parks it back off the shell. */
async function releaseBar(page: Page): Promise<void> {
  await page.mouse.up();
  await page.mouse.move(2, 2);
}

test("the bar breaks the shell's silhouette and shares its band with the arrow", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  // Playwright calls an element clipped by `overflow: hidden` visible, so the claim is
  // about the boxes and never about `isVisible`.
  const shell = await boxOfShell(page);
  const bar = await boxOf(page, "ptt-bar");
  expect(bar.x).toBeLessThan(shell.x);
  expect(bar.x + bar.width).toBeGreaterThan(shell.x);

  const arrow = await boxOf(page, "voice-arrow");
  expect(Math.abs(centre(bar) - centre(arrow))).toBeLessThan(2);
  expect(arrow.x).toBeGreaterThanOrEqual(bar.x + bar.width - 1);
  expect(arrow.x + arrow.width).toBeLessThanOrEqual(
    (await boxOf(page, "voice-mine")).x + 1,
  );

  for (const size of [PHONE, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size);
    const narrow = await boxOfShell(page);
    const shoulder = await boxOf(page, "ptt-bar");
    expect(shoulder.x).toBeLessThan(narrow.x);
    expect(
      Math.abs(centre(shoulder) - centre(await boxOf(page, "voice-arrow"))),
    ).toBeLessThan(2);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(shoulder.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
  }
});

const TOUCH_TARGET = 44;

function centre(box: { y: number; height: number }): number {
  return box.y + box.height / 2;
}

test("holding the bar puts one friend's voice in another's shell, and release ends it", async ({
  page,
  browser,
}) => {
  await recordAudio(page);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const listener = await joinAs(browser, "rival", { recording: true });

  const bar = page.getByTestId("ptt-bar");
  const before = (await voices(listener)).length;

  await holdBar(page);
  await expect(bar).toHaveAttribute("data-held", "true");
  await expect(lamp(page, "voice-mine")).toHaveAttribute("data-lit", "true");
  await expect(lamp(page, "voice-theirs")).toHaveAttribute("data-lit", "false");
  await expect(lamp(listener, "voice-theirs")).toHaveAttribute(
    "data-lit",
    "true",
  );
  await expect(lamp(listener, "voice-mine")).toHaveAttribute(
    "data-lit",
    "false",
  );
  await expect(listener.getByTestId("voice-theirs")).toContainText("TESTER");

  await expect
    .poll(async () => (await voices(listener)).length, { timeout: 15_000 })
    .toBeGreaterThan(before + 4);

  await releaseBar(page);
  await expect(bar).toHaveAttribute("data-held", "false");
  await expect(lamp(page, "voice-mine")).toHaveAttribute("data-lit", "false");
  await expect(lamp(listener, "voice-theirs")).toHaveAttribute(
    "data-lit",
    "false",
  );

  await page.waitForTimeout(700);
  const settled = (await voices(listener)).length;
  await page.waitForTimeout(700);
  expect((await voices(listener)).length).toBe(settled);

  await listener.context().close();
});

test("both ends of a transmission chirp, once per screen and never twice on the speaker's", async ({
  page,
  browser,
}) => {
  await recordAudio(page);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const listener = await joinAs(browser, "rival", { recording: true });
  await expect(listener.getByTestId("player-name")).toHaveText("rival");

  const mine = await chirps(page);
  const theirs = await chirps(listener);

  await holdBar(page);
  await expect.poll(async () => chirps(page)).toBe(mine + 1);
  await expect.poll(async () => chirps(listener)).toBe(theirs + 1);

  await releaseBar(page);
  await expect.poll(async () => chirps(page)).toBe(mine + 2);
  await expect.poll(async () => chirps(listener)).toBe(theirs + 2);

  await page.waitForTimeout(700);
  expect(await chirps(page)).toBe(mine + 2);
  expect(await chirps(listener)).toBe(theirs + 2);

  await listener.context().close();
});

test("muting silences the squelch and not the voice", async ({
  page,
  browser,
}) => {
  await recordAudio(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("ignis-snaps.muted", "1");
  });
  await apiSignIn(page, "rival");
  await page.reload();
  await pressStart(page);
  await expect.poll(async () => (await audioLog(page)).contexts).toBe(1);

  const speaker = await joinAs(browser, "tester");
  await expect(page.getByTestId("voice-theirs")).toBeVisible();

  await holdBar(speaker);
  await expect(lamp(page, "voice-theirs")).toHaveAttribute("data-lit", "true");
  await expect
    .poll(async () => (await voices(page)).length, { timeout: 15_000 })
    .toBeGreaterThan(4);
  expect(await chirps(page)).toBe(0);

  await releaseBar(speaker);
  await speaker.context().close();
});

test("signed out, the bar is inert, prompts nothing, and says what signing in buys", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const media = navigator.mediaDevices;
    const real = media.getUserMedia.bind(media);
    window.__ignisMicAsks = 0;
    media.getUserMedia = (constraints?: MediaStreamConstraints) => {
      window.__ignisMicAsks = (window.__ignisMicAsks ?? 0) + 1;
      return real(constraints);
    };
  });
  await page.goto("/");
  await pressStart(page);

  const bar = page.getByTestId("ptt-bar");
  await holdBar(page);
  await expect(page.getByText(/sign in to speak/i)).toBeVisible();
  await expect(bar).toHaveAttribute("data-held", "false");
  await expect(lamp(page, "voice-mine")).toHaveAttribute("data-lit", "false");
  await releaseBar(page);

  await holdBar(page);
  await releaseBar(page);
  expect(await page.evaluate(() => window.__ignisMicAsks)).toBe(0);
});

test("the bar works on a screen that loaded into a running event, and moves no clock", async ({
  page,
}) => {
  await apiSignIn(page);
  await setPhase(page, "countdown");
  await recordAudio(page);
  await page.goto("/");

  await expect(page.getByTestId("event-overlay")).toBeVisible();
  expect((await audioLog(page)).contexts).toBe(0);
  const before = await readEvent(page);

  await holdBar(page);
  await expect(page.getByTestId("ptt-bar")).toHaveAttribute(
    "data-held",
    "true",
  );
  await expect.poll(async () => (await audioLog(page)).contexts).toBe(1);
  await releaseBar(page);

  const after = await readEvent(page);
  expect(after.phase).toBe(before.phase);
  expect(after.day).toBe(before.day);
});

test("a denied microphone is explained where a running event cannot hide it, and is not asked for twice", async ({
  page,
}) => {
  await apiSignIn(page);
  await setPhase(page, "countdown");
  // The fake device auto-GRANTS, so a refusal is otherwise unreachable in Chromium and
  // this is the browser's half of the contract standing in for it.
  await page.addInitScript(() => {
    window.__ignisMicAsks = 0;
    navigator.mediaDevices.getUserMedia = () => {
      window.__ignisMicAsks = (window.__ignisMicAsks ?? 0) + 1;
      return Promise.reject(
        new DOMException("Permission denied", "NotAllowedError"),
      );
    };
  });
  await page.goto("/");
  await expect(page.getByTestId("event-overlay")).toBeVisible();

  await holdBar(page);
  await expect(page.getByText(/no microphone/i)).toBeVisible();
  await releaseBar(page);
  expect(await page.evaluate(() => window.__ignisMicAsks)).toBe(1);

  await holdBar(page);
  await releaseBar(page);
  expect(await page.evaluate(() => window.__ignisMicAsks)).toBe(1);
  await expect(page.getByTestId("ptt-bar")).toHaveAttribute(
    "data-held",
    "false",
  );
});

test("your own light goes out when the socket dies mid-press", async ({
  page,
}) => {
  await recordSockets(page);
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await holdBar(page);
  await expect(lamp(page, "voice-mine")).toHaveAttribute("data-lit", "true");

  await dropSocket(page);
  await expect(lamp(page, "voice-mine")).toHaveAttribute("data-lit", "false");
  await releaseBar(page);
});

declare global {
  interface Window {
    __ignisMicAsks?: number;
  }
}
