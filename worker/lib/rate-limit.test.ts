import { describe, expect, it } from "vitest";
import { rateLimiter } from "./rate-limit";

describe("rateLimiter", () => {
  it("allows a burst up to the limit and then refuses", () => {
    const limiter = rateLimiter(3, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(true);
    expect(limiter.allow("a", 2)).toBe(true);
    expect(limiter.allow("a", 3)).toBe(false);
    expect(limiter.allow("a", 4)).toBe(false);
  });

  it("counts each key on its own", () => {
    const limiter = rateLimiter(1, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(false);
    expect(limiter.allow("b", 0)).toBe(true);
  });

  it("lets the window slide", () => {
    const limiter = rateLimiter(2, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 500)).toBe(true);
    expect(limiter.allow("a", 900)).toBe(false);
    expect(limiter.allow("a", 1100)).toBe(true);
    expect(limiter.allow("a", 1200)).toBe(false);
  });

  it("forgets everything when cleared", () => {
    const limiter = rateLimiter(1, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(false);
    limiter.clear();
    expect(limiter.allow("a", 0)).toBe(true);
  });
});
