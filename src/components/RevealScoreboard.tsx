import type { DayResult } from "@shared/api";
import { BONUS_POINTS, NO_VOTE_MULTIPLIER } from "@shared/scoring";
import { curvedText, isFallbackRating, ratingText } from "@/lib/rating";

function points(value: number): string {
  return String(Math.round(value));
}

export function RevealScoreboard({ results }: { results: DayResult[] }) {
  return (
    <>
      <p className="gb-reveal-place" data-testid="scoreboard-title">
        THE WHOLE DAY
      </p>
      <ol className="gb-scoreboard" data-testid="scoreboard">
        {results.map((result) => (
          <li
            className="gb-scoreboard-row"
            data-testid="scoreboard-row"
            key={result.photoId}
          >
            <span className="gb-scoreboard-head">
              <span>
                #{result.rank} {result.uploader.name.toUpperCase()}
              </span>
              <span className="gb-reveal-total">{points(result.total)}</span>
            </span>
            <span className="gb-scoreboard-figures">
              <span className="ink-peer">PEER {result.peerPoints}</span>
              {/* The rating and the curve, both named. Either one alone is what
                  made "AI 50" unreadable. */}
              <span className="ink-jury" data-testid="scoreboard-rating">
                AI {ratingText(result.aiScore)}
                {isFallbackRating(result.aiStatus) ? "*" : ""}
              </span>
              <span className="ink-jury">{curvedText(result.aiNorm)}</span>
              {result.bonus && <span>BONUS +{BONUS_POINTS}</span>}
              {result.noVotePenalty && (
                <span>NO BALLOT ×{NO_VOTE_MULTIPLIER}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {/* Only where one actually happened, so the asterisk is never a footnote
          about nothing. */}
      {results.some((result) => isFallbackRating(result.aiStatus)) && (
        <p
          className="gb-scoreboard-note ink-jury"
          data-testid="scoreboard-note"
        >
          * THE JURY&apos;S MACHINE BROKE — 5 BY DEFAULT
        </p>
      )}
    </>
  );
}
