import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { relativeTime } from "./format";

const NOW = new Date("2026-07-25T12:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("relativeTime", () => {
  it("calls anything under a minute 'just now'", () => {
    expect(relativeTime(ago(0))).toBe("just now");
    expect(relativeTime(ago(MINUTE - 1))).toBe("just now");
  });

  it("switches to minutes at exactly one minute, and to hours at sixty", () => {
    expect(relativeTime(ago(MINUTE))).toBe("1m ago");
    expect(relativeTime(ago(59 * MINUTE))).toBe("59m ago");
    expect(relativeTime(ago(HOUR))).toBe("1h ago");
  });

  it("switches to days at exactly 24 hours", () => {
    expect(relativeTime(ago(23 * HOUR))).toBe("23h ago");
    expect(relativeTime(ago(DAY))).toBe("1d ago");
    expect(relativeTime(ago(6 * DAY))).toBe("6d ago");
  });

  it("gives up on relative wording after a week and prints the date", () => {
    const old = ago(7 * DAY);
    expect(relativeTime(old)).toBe(new Date(old).toLocaleDateString());
  });

  it("reads a future timestamp as 'just now' rather than a negative age", () => {
    // Clock skew between a phone and the worker can produce one; "-1m ago" on
    // the LCD would be worse than rounding it to the present.
    expect(relativeTime(new Date(NOW.getTime() + HOUR).toISOString())).toBe(
      "just now",
    );
  });
});
