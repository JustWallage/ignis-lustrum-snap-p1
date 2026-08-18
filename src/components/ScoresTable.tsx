import type { ArchiveDay } from "@shared/api";
import { juryForDay } from "@shared/juries";
import { BONUS_POINTS, NO_VOTE_MULTIPLIER } from "@shared/scoring";
import { ballotText } from "@/lib/ballot";
import { points, placeText } from "@/lib/figures";
import { curvedText, juryLine } from "@/lib/rating";

/** Three of these columns are called "place", so the tint is what tells a reader which
 * field each position was taken in. */
const COLUMNS = [
  { label: "Place", ink: null },
  { label: "Who", ink: null },
  { label: "Snap", ink: null },
  { label: "Peer pts", ink: "ink-peer" },
  { label: "Ballot", ink: "ink-peer" },
  { label: "Peer place", ink: "ink-peer" },
  { label: "Peer half", ink: "ink-peer" },
  { label: "Rating", ink: "ink-jury" },
  { label: "Jury place", ink: "ink-jury" },
  { label: "Jury half", ink: "ink-jury" },
  { label: "Bonus", ink: null },
  { label: "No ballot", ink: null },
  { label: "Total", ink: null },
] as const;

const NOTHING = "—";

export function ScoresTable({
  field: { day, prize, results },
  onOpen,
}: {
  field: ArchiveDay;
  onOpen: (photoId: number) => void;
}) {
  const jury = juryForDay(day);
  const winner = results[0];

  return (
    <section className="arc-scores-day" data-testid="scores-day">
      <h3 className="arc-scores-head">
        <span>Day {day}</span>
        {winner === undefined ? (
          <span data-testid="scores-outcome">Nothing was handed in.</span>
        ) : (
          <span data-testid="scores-outcome">
            {winner.uploader.name} won
            {prize === null ? "" : `: ${prize}`}
          </span>
        )}
      </h3>
      {winner !== undefined && (
        <div className="arc-scores-scroll">
          <table className="arc-scores" data-testid="scores-table">
            <thead>
              <tr>
                {COLUMNS.map(({ label, ink }) => (
                  <th key={label} scope="col" className={ink ?? undefined}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.photoId} data-testid="scores-row">
                  <th scope="row" data-testid="scores-place">
                    #{result.rank}
                  </th>
                  <td className="arc-scores-who">{result.uploader.name}</td>
                  <td>
                    <button
                      type="button"
                      className="arc-scores-shot"
                      aria-label={`Open ${result.uploader.name}'s snap from day ${String(day)}`}
                      onClick={() => {
                        onOpen(result.photoId);
                      }}
                    >
                      <img
                        loading="lazy"
                        src={result.url}
                        alt=""
                        data-testid="scores-photo"
                      />
                    </button>
                  </td>
                  <td className="ink-peer" data-testid="scores-peer-points">
                    {result.peerPoints}
                  </td>
                  <td className="ink-peer" data-testid="scores-ballot">
                    {ballotText(result.ballot)}
                  </td>
                  <td className="ink-peer" data-testid="scores-peer-place">
                    {placeText(result.peerPlace)}
                  </td>
                  <td className="ink-peer" data-testid="scores-peer-half">
                    {points(result.peerNorm)}
                  </td>
                  <td className="ink-jury" data-testid="scores-rating">
                    {juryLine(result)}
                  </td>
                  <td className="ink-jury" data-testid="scores-jury-place">
                    {placeText(result.juryPlace)}
                  </td>
                  <td className="ink-jury" data-testid="scores-jury-half">
                    {curvedText(result.aiNorm)}
                  </td>
                  <td data-testid="scores-bonus">
                    {result.bonus ? `+${String(BONUS_POINTS)}` : NOTHING}
                  </td>
                  <td data-testid="scores-penalty">
                    {result.noVotePenalty
                      ? `×${String(NO_VOTE_MULTIPLIER)}`
                      : NOTHING}
                  </td>
                  <td className="arc-scores-total" data-testid="scores-total">
                    {points(result.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="arc-scores-foot" data-testid="scores-foot">
        Judged by {jury.name}. Bonus for {jury.bonusItem}.
      </p>
    </section>
  );
}
