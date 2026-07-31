export interface Contestant {
  id: number;
  name: string;
}

export interface DayPlacing {
  userId: number;
  total: number;
  rank: number;
}

export interface Standing {
  id: number;
  name: string;
  total: number;
  wins: number;
  entries: number;
  rank: number;
}

export const WINNING_RANK = 1;

function compareForRank(a: Standing, b: Standing): number {
  return b.total - a.total || b.wins - a.wins || (a.name < b.name ? -1 : 1);
}

export function rankStandings(
  contestants: readonly Contestant[],
  placings: readonly DayPlacing[],
): Standing[] {
  const table = new Map<number, Standing>(
    contestants.map((one) => [
      one.id,
      { id: one.id, name: one.name, total: 0, wins: 0, entries: 0, rank: 0 },
    ]),
  );

  for (const placing of placings) {
    const row = table.get(placing.userId);
    if (row === undefined) continue;
    row.total += placing.total;
    row.entries += 1;
    if (placing.rank === WINNING_RANK) row.wins += 1;
  }

  return [...table.values()]
    .sort(compareForRank)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
