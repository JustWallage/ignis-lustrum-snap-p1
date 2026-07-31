import type { DayResult } from "@shared/api";
import {
  countdownSeconds,
  isAwaitingHost,
  revealStage,
  type EventState,
} from "@shared/events";
import { BONUS_POINTS, NO_VOTE_MULTIPLIER } from "@shared/scoring";
import { EventSnap } from "@/components/EventSnap";
import { RevealScoreboard } from "@/components/RevealScoreboard";
import { useAuth } from "@/context/AuthContext";
import { useDayResults } from "@/hooks/useDayResults";
import { useNow } from "@/hooks/useNow";
import { curvedText, isFallbackRating, ratingText } from "@/lib/rating";

const REFRESH_MS = 100;

const PLACES: Record<number, string> = { 1: "1ST", 2: "2ND", 3: "3RD" };

function placeLabel(rank: number): string {
  return PLACES[rank] ?? `${String(rank)}TH`;
}

function photoUrl(photoId: number): string {
  return `/api/photos/${String(photoId)}/image`;
}

function points(value: number): string {
  return String(Math.round(value));
}

/** Every figure travels on the result — the screen PRINTS rather than derives. Both
 * halves show the raw tally next to the curve, because the AI half printed alone under a
 * bare "AI" read "AI 50" on the winner's card every day (#97). */
function ScoreBreakdown({ result }: { result: DayResult }) {
  return (
    <p className="gb-reveal-breakdown" data-testid="podium-score">
      <span>
        PEER {result.peerPoints} PTS → {points(result.peerNorm)}
      </span>
      <span>{curvedText(result.aiNorm)}</span>
      {result.bonus && <span>BONUS +{BONUS_POINTS}</span>}
      {result.noVotePenalty && (
        <span data-testid="podium-penalty">
          NO BALLOT ×{NO_VOTE_MULTIPLIER}
        </span>
      )}
      <span className="gb-reveal-total">= {points(result.total)}</span>
    </p>
  );
}

function JuryRating({ result }: { result: DayResult }) {
  return (
    <p className="gb-reveal-rating" data-testid="podium-rating">
      JURY {ratingText(result.aiScore)}
      {isFallbackRating(result.aiStatus) && (
        <span className="gb-reveal-rating-note"> (MACHINE BROKE)</span>
      )}
    </p>
  );
}

function PodiumCard({ rank, result }: { rank: number; result: DayResult }) {
  return (
    <>
      <p className="gb-reveal-place" data-testid="podium-place">
        {placeLabel(rank)} PLACE
      </p>
      <EventSnap
        url={result.url}
        alt={`The ${placeLabel(rank)} place snap`}
        testId="podium-photo"
        title={`${placeLabel(rank)} place`}
      />
      <p className="gb-reveal-name" data-testid="podium-name">
        {result.uploader.name.toUpperCase()}
      </p>
      {result.juryCaption !== null && (
        <p className="gb-reveal-caption" data-testid="podium-caption">
          “{result.juryCaption}”
        </p>
      )}
      <JuryRating result={result} />
      {result.critique !== null && (
        <p className="gb-reveal-critique" data-testid="podium-critique">
          {result.critique}
        </p>
      )}
      <ScoreBreakdown result={result} />
    </>
  );
}

function PodiumFooter({
  event,
  isHost,
  onNext,
}: {
  event: EventState;
  isHost: boolean;
  onNext: () => void;
}) {
  const now = useNow(REFRESH_MS);
  const building = countdownSeconds(event.podiumNextAt, now);
  if (building !== null) {
    return (
      <p className="gb-event-line" data-testid="podium-next-in">
        NEXT IN {building}
      </p>
    );
  }
  if (!isAwaitingHost(event)) return null;
  if (!isHost) {
    return (
      <p className="gb-event-line" data-testid="podium-waiting">
        WAITING FOR THE HOST
      </p>
    );
  }
  return (
    <button
      type="button"
      className="gb-wheel-spin"
      data-testid="podium-next"
      onClick={onNext}
    >
      NEXT
    </button>
  );
}

export function RevealScreen({
  event,
  onHostNext,
}: {
  event: EventState;
  onHostNext: () => void;
}) {
  const { user } = useAuth();
  const now = useNow(REFRESH_MS);
  const stage = revealStage(event, now);
  const results = useDayResults(event.day);

  if (user === null) {
    return (
      <>
        <p className="gb-event-title">REVEAL</p>
        <p className="gb-event-line">SIGN IN TO SEE TODAY&apos;S SNAPS</p>
      </>
    );
  }

  if (stage.kind === "empty") {
    return (
      <>
        <p className="gb-event-title">NO SNAPS TODAY</p>
        <p className="gb-event-line">NOBODY HANDED ONE IN</p>
      </>
    );
  }

  if (stage.kind === "parade") {
    return (
      <>
        <p className="gb-event-line">THE JURY IS LOOKING THEM OVER</p>
        <img
          className="gb-reveal-photo"
          // Keyed by the id, so React swaps the element rather than briefly showing
          // the previous snap under the new src.
          key={stage.photoId}
          src={photoUrl(stage.photoId)}
          alt="One of today's snaps"
          data-testid="reveal-photo"
          data-photo-id={stage.photoId}
        />
        <p className="gb-reveal-count" data-testid="reveal-progress">
          {stage.at + 1}/{event.revealPhotoIds.length}
        </p>
      </>
    );
  }

  const showing =
    stage.kind === "podium"
      ? results?.find((result) => result.rank === stage.rank)
      : undefined;

  if (stage.kind === "settling" || results === undefined) {
    // The DO's alarm is a beat away, so there is nothing honest to name yet.
    return (
      <>
        <p className="gb-event-title">REVEAL</p>
        <p className="gb-event-line">THE JURY HAS SEEN THEM ALL</p>
      </>
    );
  }

  return (
    <>
      {stage.kind === "scoreboard" ? (
        <RevealScoreboard results={results} />
      ) : showing === undefined ? (
        <p className="gb-event-line">THE JURY HAS SEEN THEM ALL</p>
      ) : (
        <PodiumCard rank={stage.rank} result={showing} />
      )}
      <PodiumFooter
        event={event}
        isHost={event.hostUserId === user.id}
        onNext={onHostNext}
      />
    </>
  );
}
