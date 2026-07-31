import { leaderboardSchema, type Standing } from "@shared/api";
import { GbPlaceholder } from "@/components/GbPending";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";

const PODIUM = 3;

function points(value: number): string {
  return String(Math.round(value));
}

function record(standing: Standing): string {
  const days = `${String(standing.entries)} day${standing.entries === 1 ? "" : "s"}`;
  return standing.wins === 0 ? days : `${days} · ${String(standing.wins)} won`;
}

export function Leaderboard() {
  const board = useCachedFetch("/api/leaderboard", leaderboardSchema);
  useRealtimeEvents(board.mutate);

  const standings = board.data?.standings ?? [];
  const played = standings.some((one) => one.entries > 0);

  if (!played) {
    return (
      <GbPlaceholder
        error={board.error}
        loading={board.loading}
        testId="leaderboard-empty"
      >
        No day has been revealed yet, so nobody is ahead.
      </GbPlaceholder>
    );
  }

  const podium = standings.slice(0, PODIUM);
  const rest = standings.slice(PODIUM);

  return (
    <div className="space-y-2" data-testid="leaderboard">
      <ol className="flex items-end gap-2">
        {podium.map((standing) => (
          <li
            key={standing.user.id}
            className="gb-podium"
            data-rank={standing.rank}
          >
            <span className="gb-podium-rank">#{standing.rank}</span>
            <span className="gb-podium-name">{standing.user.name}</span>
            <span className="gb-podium-total">{points(standing.total)}</span>
            <span className="gb-podium-record">{record(standing)}</span>
          </li>
        ))}
      </ol>
      {rest.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
          {rest.map((standing) => (
            <li key={standing.user.id} className="flex gap-2">
              <span className="font-bold">#{standing.rank}</span>
              <span className="min-w-0 flex-1 truncate uppercase">
                {standing.user.name}
              </span>
              <span className="opacity-70">{record(standing)}</span>
              <span className="font-bold">{points(standing.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
