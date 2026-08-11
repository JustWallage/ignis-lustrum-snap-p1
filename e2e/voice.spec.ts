import type { Locator, Page } from "@playwright/test";
import {
  apiSignIn,
  audioLog,
  boxOf,
  chirps,
  dropSocket,
  expect,
  joinAs,
  lcd,
  pressStart,
  readEvent,
  recordAudio,
  recordSockets,
  setPhase,
  test,
  voices,
} from "./fixtures";

const PHONE = { width: 390, height: 844 };

async function boxOfSelector(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} is not on screen`);
  return box;
}

/** How far the grille's rounded corner stays inside the shell's foot, in px — the two arcs'
 * centres apart, plus the inner radius, against the outer one. Negative means they cross. */
async function cornerClearance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const arc = (element: Element) => {
      const box = element.getBoundingClientRect();
      const radius = parseFloat(
        getComputedStyle(element).borderBottomRightRadius,
      );
      return { radius, x: box.right - radius, y: box.bottom - radius };
    };
    const shell = document.querySelector(".gb-shell");
    const grille = document.querySelector('[data-testid="ptt-bar"]');
    if (shell === null || grille === null) {
      throw new Error("the shell and the grille are not both on screen");
    }
    const outer = arc(shell);
    const inner = arc(grille);
    return (
      outer.radius -
      (Math.hypot(outer.x - inner.x, outer.y - inner.y) + inner.radius)
    );
  });
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

test("the grille IS the button: bottom right of the face, both lights above it, and it holds with the menu open", async ({
  page,
  browser,
}) => {
  await apiSignIn(page, "rival");
  await page.goto("/");
  await pressStart(page);

  for (const size of [PHONE, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);

    const shell = await boxOfSelector(page, ".gb-shell");
    const grille = await boxOf(page, "ptt-bar");
    expect(grille.x).toBeGreaterThan(shell.x + shell.width / 2);
    expect(grille.x + grille.width).toBeLessThanOrEqual(shell.x + shell.width);
    expect(grille.y + grille.height).toBeLessThanOrEqual(
      shell.y + shell.height,
    );
    expect(grille.width).toBeGreaterThanOrEqual(TOUCH_TARGET);
    expect(grille.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
    // Both viewports, because this crossed at desktop ONLY: `.gb-shell`'s own `cqw` resolves
    // against the viewport (an element is a query container for its children, not itself)
    // while the grille's is one percent of the shell, so the foot and the corner agreed at
    // 390px and the foot ate the corner once `98dvh` capped the height.
    expect(await cornerClearance(page)).toBeGreaterThan(1);

    const ab = await boxOfSelector(page, ".gb-ab");
    for (const row of ["voice-mine", "voice-theirs"] as const) {
      const light = await boxOf(page, row);
      expect(light.y + light.height).toBeLessThanOrEqual(grille.y);
      expect(light.x).toBeGreaterThanOrEqual(grille.x - 1);
      expect(light.x + light.width).toBeLessThanOrEqual(
        grille.x + grille.width + 1,
      );
      expect(light.y).toBeGreaterThanOrEqual(ab.y + ab.height);
    }

    for (const pill of ["select-button", "start-button"] as const) {
      const cap = await boxOf(page, pill);
      expect(cap.x + cap.width).toBeLessThan(grille.x);
      expect(cap.x).toBeGreaterThanOrEqual(shell.x);
      expect(cap.y + cap.height).toBeLessThanOrEqual(shell.y + shell.height);
    }
  }

  const idle = await boxOf(page, "ptt-bar");
  const speaker = await joinAs(browser, "tester");
  // A press on a socket that has not opened yet is DROPPED and never retried, and `joinAs`
  // only waits on `/api/me`. Seeing the speaker in this screen's own company is the proof
  // both ends are on the DO.
  await expect(lcd(page)).toHaveAttribute("aria-label", /tester/i);
  await holdBar(speaker);
  // `nameLabel` cuts a name to six characters, so a name is always NARROWER than the wording
  // it replaces: sized by its content this stack would SHRINK here, taking the button with it.
  await expect(page.getByTestId("voice-theirs")).toContainText("TESTER");
  expect(await boxOf(page, "ptt-bar")).toEqual(idle);
  await releaseBar(speaker);
  await speaker.context().close();

  await page.getByTestId("select-button").click();
  await expect(page.getByTestId("dialogue-choices")).toBeVisible();
  await holdBar(page);
  await expect(page.getByTestId("ptt-bar")).toHaveAttribute(
    "data-held",
    "true",
  );
  await expect(lamp(page, "voice-mine")).toHaveAttribute("data-lit", "true");
  await releaseBar(page);
  await expect(page.getByTestId("dialogue-choices")).toBeVisible();
  expect(await boxOf(page, "ptt-bar")).toEqual(idle);
});

const TOUCH_TARGET = 44;

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

  // The DO refuses a second speaker, so the listener's own bar must not light for a
  // transmission that will never leave their shell.
  await holdBar(listener);
  await expect(lamp(listener, "voice-mine")).toHaveAttribute(
    "data-lit",
    "false",
  );
  await releaseBar(listener);

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
  // A press on a socket that has not opened yet is DROPPED and never retried, and
  // `joinAs` only waits on `/api/me`. Seeing the speaker in this screen's own company is
  // the proof both ends are on the DO.
  await expect(lcd(page)).toHaveAttribute("aria-label", /tester/i);

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
