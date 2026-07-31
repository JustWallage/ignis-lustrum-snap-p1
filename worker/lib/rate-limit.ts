// A per-key sliding window in memory. No table and no DO on purpose: a loop — the
// actual threat — lives in one isolate for as long as it runs. The cost, said plainly:
// the window is per isolate, so this is a ceiling on a bill nobody is trying to run
// up, not an access control.

export interface RateLimiter {
  allow: (key: string, now?: number) => boolean;
  clear: () => void;
}

export function rateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    allow: (key, now = Date.now()) => {
      const since = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((at) => at > since);
      if (recent.length >= limit) {
        // Still written back: the pruned list is smaller than what was there.
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    clear: () => {
      hits.clear();
    },
  };
}
