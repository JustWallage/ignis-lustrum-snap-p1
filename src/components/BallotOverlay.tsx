import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ballotSchema,
  MAX_PICKS,
  voteCandidateListSchema,
  type VoteCandidate,
} from "@shared/api";
import { NO_VOTE_MULTIPLIER } from "@shared/scoring";
import { GbPlaceholder } from "@/components/GbPending";
import { GbWindow } from "@/components/GbWindow";
import { SnapViewer } from "@/components/SnapViewer";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import {
  noVoteWarning,
  podium,
  rankLabel,
  rankOf,
  RANKS,
  sameBallot,
  slotState,
  tapRank,
} from "@/lib/ballot";
import { readApiError } from "@/lib/api";

const SAVE_AFTER_MS = 400;

type SaveState = "idle" | "saving" | "saved";

const SAVE_LABELS: Record<SaveState, string> = {
  idle: "",
  saving: "SAVING…",
  saved: "SAVED",
};

const OWN_SNAP = "This one is yours. You can talk about it, never rank it.";

const NO_CANDIDATES: readonly VoteCandidate[] = [];
const NO_PICKS: readonly number[] = [];

export function BallotOverlay({ onClose }: { onClose: () => void }) {
  const candidates = useCachedFetch(
    "/api/votes/candidates",
    voteCandidateListSchema,
  );
  const mine = useCachedFetch("/api/votes/mine", ballotSchema);
  const { mutate: refreshCandidates } = candidates;
  const { mutate: refreshBallot } = mine;

  // Null until something is tapped, so a refetch landing mid-decision cannot yank a
  // half-made ballot away.
  const [draft, setDraft] = useState<number[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState("");

  // Memoised because both feed hook dependency lists: a fresh `[]` every render
  // would rebuild the keyboard listener and the tap handler.
  const list = useMemo(
    () => candidates.data?.candidates ?? NO_CANDIDATES,
    [candidates.data],
  );
  const saved = useMemo(() => mine.data?.photoIds ?? NO_PICKS, [mine.data]);
  const picks = draft ?? saved;
  const dirty = draft !== null && !sameBallot(draft, saved);

  const refresh = useCallback(() => {
    refreshCandidates();
    refreshBallot();
  }, [refreshCandidates, refreshBallot]);
  useRealtimeEvents(refresh);

  // Debounced autosave of the WHOLE ballot. The route is an idempotent replace and a
  // partial ballot is legal, so there is nothing to prompt about on the way out. A
  // refusal is READ rather than swallowed: an event starting mid-ballot answers 409.
  useEffect(() => {
    if (draft === null || !dirty) return;
    const timer = setTimeout(() => {
      void (async () => {
        setSave("saving");
        const res = await fetch("/api/votes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoIds: draft }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "Could not save your votes"));
          setSave("idle");
          return;
        }
        setError("");
        setSave("saved");
        refreshBallot();
      })();
    }, SAVE_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [dirty, draft, refreshBallot]);

  const rank = useCallback(
    (candidate: VoteCandidate, slot: number) => {
      const result = tapRank(draft ?? saved, {
        id: candidate.id,
        rank: slot,
        rankable: !candidate.isMine,
      });
      setDraft(result.picks);
      setNote(result.note);
      setSave("idle");
    },
    [draft, saved],
  );

  // Resolved out of the LIST rather than trusting the stored id: a snap swapped out
  // from under the viewer stops being a conversation.
  const current = list.find((candidate) => candidate.id === open);

  const jumpTo = useCallback((id: number) => {
    setNote(null);
    setOpen(id);
  }, []);

  if (current !== undefined) {
    const held = rankOf(picks, current.id);
    return (
      // Every candidate's thread comes with the shell, other people's and your own: the
      // route is open to any signed-in friend, and the only reason a snap you did not
      // take had no thread before is that it had no surface to show one on. A commenter
      // signs their name; the photographer is still nobody — and commenting on your own
      // snap tells the thread who you are, which is the player's call to make.
      <SnapViewer
        list={list}
        openId={current.id}
        onOpen={jumpTo}
        onClose={onClose}
        header={<Podium picks={picks} list={list} onJump={jumpTo} />}
        note={
          <>
            {note !== null && (
              <p
                className="text-xs font-bold uppercase tracking-widest"
                data-testid="viewer-note"
              >
                {note}
              </p>
            )}
            {error !== "" && (
              <p className="gb-error" role="alert">
                {error}
              </p>
            )}
            {current.isMine && (
              <p className="text-xs" data-testid="viewer-own">
                {OWN_SNAP}
              </p>
            )}
          </>
        }
        controls={RANKS.map((slot) => (
          <button
            key={slot}
            type="button"
            className="gb-btn gb-rank px-3"
            data-slot={slotState(picks, slot, current.id)}
            disabled={current.isMine}
            aria-pressed={held === slot}
            aria-label={`Rank ${rankLabel(slot)}`}
            onClick={() => {
              rank(current, slot);
            }}
          >
            {slot}
          </button>
        ))}
        trailing={
          <>
            <span
              className="ml-auto text-xs font-bold uppercase tracking-widest"
              data-testid="viewer-rank"
            >
              {current.isMine
                ? "YOURS"
                : held === null
                  ? "UNRANKED"
                  : rankLabel(held)}
            </span>
            <button
              type="button"
              className="gb-btn px-3"
              onClick={() => {
                setOpen(null);
                setNote(null);
              }}
            >
              All snaps
            </button>
            <button type="button" className="gb-btn px-3" onClick={onClose}>
              Leave
            </button>
          </>
        }
        footer={<SaveReadout state={save} picks={picks} />}
      />
    );
  }

  return (
    <GbWindow title="Vote" shape="full" onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="shrink-0 text-xs">
          Tap a snap to judge it full screen. No photographer is named until the
          reveal.
        </p>
        {error !== "" && (
          <p className="gb-error shrink-0" role="alert">
            {error}
          </p>
        )}
        {list.length === 0 ? (
          <GbPlaceholder
            error={candidates.error}
            loading={candidates.loading}
            testId="vote-empty"
          >
            Nobody has handed a snap in yet.
          </GbPlaceholder>
        ) : (
          // `content-start` because the grid now fills: under the default
          // `align-content: stretch` its auto rows absorb the leftover height instead of
          // packing at the top.
          <ul
            className="grid min-h-0 flex-1 grid-cols-3 content-start gap-2 overflow-y-auto"
            data-testid="vote-candidates"
          >
            {list.map((candidate, index) => {
              const held = rankOf(picks, candidate.id);
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className="gb-pick"
                    aria-pressed={held !== null}
                    aria-label={`Snap ${index + 1}`}
                    onClick={() => {
                      jumpTo(candidate.id);
                    }}
                  >
                    <img
                      src={candidate.url}
                      alt={`Snap ${index + 1}`}
                      className="aspect-square w-full bg-[#071821] object-cover"
                    />
                    <span className="gb-pick-rank">
                      {candidate.isMine
                        ? "YOURS"
                        : held === null
                          ? `#${index + 1}`
                          : rankLabel(held)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <SaveReadout state={save} picks={picks} />
      </div>
    </GbWindow>
  );
}

function Podium({
  picks,
  list,
  onJump,
}: {
  picks: readonly number[];
  list: readonly VoteCandidate[];
  onJump: (id: number) => void;
}) {
  return (
    <ul className="flex shrink-0 gap-2" data-testid="podium">
      {podium(picks).map((id, index) => {
        const held =
          id === null ? undefined : list.find((one) => one.id === id);
        const slot = index + 1;
        return (
          <li key={slot} className="flex-1">
            <button
              type="button"
              className="gb-ballot-slot"
              data-rank={slot}
              data-filled={held !== undefined}
              disabled={held === undefined}
              aria-label={`${rankLabel(slot)}${held === undefined ? " empty" : ""}`}
              onClick={() => {
                if (held !== undefined) onJump(held.id);
              }}
            >
              <span className="gb-ballot-slot-label">{rankLabel(slot)}</span>
              {held === undefined ? (
                <span className="gb-ballot-slot-empty">—</span>
              ) : (
                <img src={held.url} alt="" className="gb-ballot-slot-thumb" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SaveReadout({
  state,
  picks,
}: {
  state: SaveState;
  picks: readonly number[];
}) {
  return (
    <div className="shrink-0 space-y-1">
      {picks.length === 0 && (
        <p className="text-xs" data-testid="vote-penalty">
          {noVoteWarning(NO_VOTE_MULTIPLIER)}
        </p>
      )}
      <p
        className="flex gap-2 text-xs font-bold uppercase tracking-widest"
        data-testid="vote-summary"
      >
        <span>
          {picks.length}/{MAX_PICKS} PICKED
        </span>
        <span className="ml-auto" data-testid="vote-save">
          {SAVE_LABELS[state]}
        </span>
      </p>
    </div>
  );
}
