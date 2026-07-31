import { describe, expect, it } from "vitest";
import { installInstructions } from "@/lib/pwa";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// iPadOS 13+ hides behind a desktop Safari string; only the touch points differ.
const IPAD =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const DESKTOP_CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const isIosCopy = (pages: readonly string[]) =>
  pages.some((page) => /add to home screen/i.test(page)) &&
  pages.some((page) => /share/i.test(page));

describe("installInstructions", () => {
  it("walks an iPhone through the share sheet", () => {
    expect(isIosCopy(installInstructions(IPHONE, 5))).toBe(true);
  });

  it("sees through an iPad pretending to be a Mac", () => {
    expect(isIosCopy(installInstructions(IPAD, 5))).toBe(true);
  });

  it("does not mistake a real Mac for an iPad", () => {
    expect(isIosCopy(installInstructions(IPAD, 0))).toBe(false);
  });

  it("points every other browser at its own menu", () => {
    const pages = installInstructions(DESKTOP_CHROME, 0);
    expect(isIosCopy(pages)).toBe(false);
    expect(pages.join(" ")).toMatch(/install/i);
  });

  it("always has something to say, so the item is never a dead button", () => {
    for (const ua of [IPHONE, IPAD, DESKTOP_CHROME]) {
      const pages = installInstructions(ua, 5);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.every((page) => page.length > 0)).toBe(true);
    }
  });
});
