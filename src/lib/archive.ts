import type { ArchiveDay, DayResult } from "@shared/api";

/**
 * What the archive's two rails do to `GET /api/days`, as pure functions. Both filters
 * are applied in the BROWSER because the payload is already exactly what the caller
 * may see, so narrowing it is a question about the screen rather than a new request.
 */

export const ALL = "all";

export interface ArchiveEntry {
  day: number;
  prize: string | null;
  result: DayResult;
}

export interface ArchiveFilter {
  day: number | typeof ALL;
  who: string;
}

/** The standings hand this a player the archive has nothing by (#3): a rail built from
 * the days alone would leave that filter applied with no chip pressed anywhere. */
export function photographers(
  days: readonly ArchiveDay[],
  selected: string,
): string[] {
  const names = new Set(
    days.flatMap((one) => one.results.map((r) => r.uploader.name)),
  );
  if (selected !== ALL) names.add(selected);
  return [...names].sort();
}

export function feedOf(
  days: readonly ArchiveDay[],
  filter: ArchiveFilter,
): ArchiveEntry[] {
  return days
    .filter((one) => filter.day === ALL || one.day === filter.day)
    .flatMap((one) =>
      one.results
        .filter(
          (result) => filter.who === ALL || result.uploader.name === filter.who,
        )
        .map((result) => ({ day: one.day, prize: one.prize, result })),
    );
}

/**
 * The newest revealed day, because that is what somebody walking into the house came
 * to read. `null` is "nobody has chosen yet" rather than a third filter state —
 * storing the resolution would need an effect to wait for the fetch.
 */
export function dayInView(
  days: readonly ArchiveDay[],
  chosen: number | typeof ALL | null,
): number | typeof ALL {
  return chosen ?? days[0]?.day ?? ALL;
}
