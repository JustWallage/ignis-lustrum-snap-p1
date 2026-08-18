import { useMemo, useState, type ReactNode } from "react";
import { archiveSchema } from "@shared/api";
import { juryForDay } from "@shared/juries";
import { WINNING_RANK } from "@shared/leaderboard";
import { AvatarGallery } from "@/components/AvatarGallery";
import { DeleteSnapButton } from "@/components/DeleteSnapButton";
import { GbPlaceholder } from "@/components/GbPending";
import { Leaderboard } from "@/components/Leaderboard";
import { LikeButton } from "@/components/LikeButton";
import { Modal } from "@/components/Modal";
import { ScoresTable } from "@/components/ScoresTable";
import { SnapViewer } from "@/components/SnapViewer";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { usePhotoLike } from "@/hooks/usePhotoLike";
import {
  ALL,
  dayInView,
  feedOf,
  fieldsOf,
  photographers,
  type ArchiveEntry,
} from "@/lib/archive";
import { points } from "@/lib/figures";
import { curvedText, juryLine } from "@/lib/rating";
import type { ViewerSnap } from "@/lib/viewer";

const VIEWS = [
  { id: "days", label: "Days" },
  { id: "scores", label: "Scores" },
  { id: "standings", label: "Standings" },
  { id: "avatars", label: "Avatars" },
] as const;

type View = (typeof VIEWS)[number]["id"];

export function ArchiveDialog({
  onDelete,
  onWorn,
  onClose,
}: {
  onDelete: (id: number) => void;
  onWorn: () => void;
  onClose: () => void;
}) {
  const archive = useCachedFetch("/api/days", archiveSchema);
  const [chosenDay, setChosenDay] = useState<number | typeof ALL | null>(null);
  const [who, setWho] = useState<string>(ALL);
  const [view, setView] = useState<View>("days");
  const [open, setOpen] = useState<number | null>(null);

  useRealtimeEvents(archive.mutate);

  const days = useMemo(() => archive.data?.days ?? [], [archive.data]);
  const day = dayInView(days, chosenDay);
  const names = useMemo(() => photographers(days, who), [days, who]);
  const feed = useMemo(() => feedOf(days, { day, who }), [days, day, who]);
  const fields = useMemo(() => fieldsOf(days, day), [days, day]);
  // The table's own rows, which the By-photographer rail does not narrow — so the
  // viewer a thumbnail opens pages the field the reader is looking at rather than a
  // feed that may not contain the row they tapped.
  const rows = useMemo(() => feedOf(days, { day, who: ALL }), [days, day]);
  const entries = view === "scores" ? rows : feed;
  const paging = useMemo<ViewerSnap[]>(
    () =>
      entries.map(({ result }) => ({ id: result.photoId, url: result.url })),
    [entries],
  );
  const shown = entries.find(({ result }) => result.photoId === open);

  return (
    <>
      <Modal label="Archive" full onClose={onClose}>
        <div className="arc-screen" data-testid="archive">
          <header className="arc-bar">
            <h2 className="arc-title">Archive</h2>
            <div className="arc-tabs">
              {VIEWS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className="arc-tab"
                  aria-pressed={view === id}
                  onClick={() => {
                    setView(id);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="arc-close"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </header>
          {/* Every view that is not the feed branches ABOVE the empty gate below:
              inside it, a shelf nobody has revealed a day on would answer "Avatars"
              with "nothing is in the archive". */}
          {view === "standings" ? (
            <div className="arc-panel" data-testid="standings-panel">
              <Leaderboard
                onPick={(name) => {
                  setChosenDay(ALL);
                  setWho(name);
                  setView("days");
                }}
              />
            </div>
          ) : view === "avatars" ? (
            <div className="arc-panel">
              <AvatarGallery mineOnly={false} onWorn={onWorn} />
            </div>
          ) : days.length === 0 ? (
            <div className="arc-panel">
              <GbPlaceholder
                error={archive.error}
                loading={archive.loading}
                testId="archive-empty"
              >
                Nothing is in the archive until a day has been revealed.
              </GbPlaceholder>
            </div>
          ) : (
            <>
              {/* Two rails of chips rather than two `<select>`s: on a phone a
                  filter you can see the options of is a filter people use, and
                  "back to everything" is one tap at the head of each rail. */}
              <div className="arc-rails">
                <Rail label="Day" testId="archive-days">
                  <Chip
                    label="All days"
                    on={day === ALL}
                    onPick={() => {
                      setChosenDay(ALL);
                    }}
                  />
                  {days.map((one) => (
                    <Chip
                      key={one.day}
                      label={`Day ${String(one.day)}`}
                      on={day === one.day}
                      onPick={() => {
                        setChosenDay(one.day);
                      }}
                    />
                  ))}
                </Rail>
                {view === "days" && (
                  <Rail label="By" testId="archive-people">
                    <Chip
                      label="Everyone"
                      on={who === ALL}
                      onPick={() => {
                        setWho(ALL);
                      }}
                    />
                    {names.map((name) => (
                      <Chip
                        key={name}
                        label={name}
                        on={who === name}
                        onPick={() => {
                          setWho(name);
                        }}
                      />
                    ))}
                  </Rail>
                )}
              </div>
              {view === "scores" ? (
                <div
                  className="arc-panel arc-scores-panel"
                  data-testid="scores"
                >
                  {fields.map((field) => (
                    <ScoresTable
                      key={field.day}
                      field={field}
                      onOpen={setOpen}
                    />
                  ))}
                </div>
              ) : feed.length === 0 ? (
                <p className="arc-panel" data-testid="archive-none">
                  Nothing to show for that day and that photographer.
                </p>
              ) : (
                <ul className="arc-feed" data-testid="archive-results">
                  {feed.map((entry) => (
                    <Card
                      key={entry.result.photoId}
                      entry={entry}
                      onOpen={setOpen}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </Modal>
      {shown !== undefined && (
        <ArchiveViewer
          entry={shown}
          list={paging}
          onOpen={setOpen}
          onDelete={onDelete}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

function ArchiveViewer({
  entry: { day, prize, result },
  list,
  onOpen,
  onDelete,
  onClose,
}: {
  entry: ArchiveEntry;
  list: readonly ViewerSnap[];
  onOpen: (photoId: number) => void;
  onDelete: (photoId: number) => void;
  onClose: () => void;
}) {
  return (
    <SnapViewer
      list={list}
      openId={result.photoId}
      onOpen={onOpen}
      onClose={onClose}
      note={
        <div className="shrink-0 space-y-1">
          {result.critique !== null && (
            <p className="text-xs" data-testid="viewer-critique">
              {result.critique}
            </p>
          )}
          <p className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-widest">
            <span data-testid="viewer-who">{result.uploader.name}</span>
            <span>Day {day}</span>
            <span className="ink-jury" data-testid="viewer-rating">
              {juryLine(result)}
            </span>
            {prize !== null && result.rank === WINNING_RANK && (
              <span data-testid="viewer-prize">Won: {prize}</span>
            )}
          </p>
        </div>
      }
      // Keyed by the photograph: `useCachedFetch` keeps the last path's data until the
      // new one lands, and a stale `likedByMe` would send the wrong method — a heart
      // that unlikes the snap you just paged onto.
      controls={<SnapLike key={result.photoId} id={result.photoId} />}
      trailing={
        <DeleteSnapButton
          uploaderId={result.uploader.id}
          onDelete={() => {
            onDelete(result.photoId);
          }}
        />
      }
    />
  );
}

function SnapLike({ id }: { id: number }) {
  const like = usePhotoLike(id);
  return <LikeButton {...like} />;
}

function Rail({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="arc-rail" data-testid={testId}>
      <span className="arc-rail-label">{label}</span>
      <div className="arc-rail-scroll">{children}</div>
    </div>
  );
}

function Chip({
  label,
  on,
  onPick,
}: {
  label: string;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className="arc-chip"
      aria-pressed={on}
      onClick={onPick}
    >
      {label}
    </button>
  );
}

function Card({
  entry: { day, prize, result },
  onOpen,
}: {
  entry: ArchiveEntry;
  onOpen: (photoId: number) => void;
}) {
  const jury = juryForDay(day);
  return (
    <li className="arc-card" data-testid="archive-card">
      <button
        type="button"
        className="arc-shot"
        aria-label={`Open ${result.uploader.name}'s snap from day ${String(day)}`}
        onClick={() => {
          onOpen(result.photoId);
        }}
      >
        <img
          loading="lazy"
          src={result.url}
          alt=""
          data-testid="archive-photo"
          className="arc-photo"
        />
        <span className="arc-rank">#{result.rank}</span>
      </button>
      <div className="arc-body">
        {result.critique !== null && (
          <p className="arc-critique" data-testid="archive-critique">
            {result.critique}
          </p>
        )}
        <p className="arc-meta">
          <span className="arc-who">{result.uploader.name}</span>
          <span>Day {day}</span>
          <span data-testid="archive-jury">Judged by {jury.name}</span>
          {/* The jury's rating out of ten, on the line you read rather than
              behind the `<details>` with the arithmetic — this card's own note
              asked for it here, and #97 is precisely that a rating nobody could
              find was a rating nobody had. */}
          <span className="arc-rating ink-jury" data-testid="archive-rating">
            {juryLine(result)}
          </span>
        </p>
        {/* What the wheel gave them, beside who won it. A day that never reached
            a landing has no award and shows no slot for one. */}
        {prize !== null && result.rank === WINNING_RANK && (
          <p className="arc-prize" data-testid="archive-prize">
            Won: {prize}
          </p>
        )}
        <details className="arc-details">
          <summary>{points(result.total)} points</summary>
          <p className="arc-figures" data-testid="archive-figures">
            <span>Rank #{result.rank}</span>
            <span className="ink-peer">Peer {points(result.peerNorm)}</span>
            {/* The jury half, named so it cannot be read as a rating. It used to be
                printed here as "AI 43" — a position in the day's field under a label
                that reads like a score out of ten, which is the readout #97 is about.
                The rating is on the meta line above. */}
            <span className="ink-jury">{curvedText(result.aiNorm)}</span>
            {result.bonus && <span>Bonus for {jury.bonusItem}</span>}
            {result.noVotePenalty && <span>No vote ×0.5</span>}
          </p>
        </details>
      </div>
    </li>
  );
}
