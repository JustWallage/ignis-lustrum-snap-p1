import { dayPhotosSchema, type PhotoVerdict } from "@shared/api";
import { apiFetch, readApiError } from "@/lib/api";

const DELETE_FAILED = "The bin jammed. Have another go at it.";

/**
 * Purges a photograph and everything hung off it — likes, comments, votes, the jury's
 * verdict.
 */
export async function deleteSnap(id: number): Promise<void> {
  const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readApiError(res, DELETE_FAILED));
}

/**
 * How many of a day's snaps the jury did not really rank. A `failed` verdict is the
 * fallback 5 the machine leaves behind when it breaks, and `scoreDay` prices it exactly
 * as it prices a MISSING one — the field's median — so to the day's order the two are
 * one thing and this counts them together.
 */
function unjudgedCount(
  photoCount: number,
  verdicts: readonly PhotoVerdict[],
): number {
  const stood = verdicts.filter((verdict) => verdict.aiStatus === "ok").length;
  return photoCount - stood;
}

export function unjudgedWarning(
  photoCount: number,
  verdicts: readonly PhotoVerdict[],
): string | null {
  const unjudged = unjudgedCount(photoCount, verdicts);
  if (unjudged <= 0) return null;
  const many = unjudged === 1 ? "snap has" : "snaps have";
  return `JURY: ${String(unjudged)} of today's ${String(photoCount)} ${many} no verdict. Start now and each of them takes the field's middle place — or back out, describe them in the console and rank the day once.`;
}

/**
 * Admin-only, and the host's START is the only caller — itself admin-gated. Read off the
 * console's own day listing rather than a second route. A read that cannot be made
 * answers NO WARNING: a jury the host cannot ask about must not be a wheel they cannot
 * spin.
 */
export async function juryGapOn(day: number): Promise<string | null> {
  try {
    const listed = await apiFetch(
      `/api/admin/days/${String(day)}/photos`,
      dayPhotosSchema,
    );
    return unjudgedWarning(listed.photos.length, listed.verdicts);
  } catch {
    return null;
  }
}
