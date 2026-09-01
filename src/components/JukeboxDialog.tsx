import { useCallback, useEffect, useRef, useState } from "react";
import { nowPlaying, type JukeboxState } from "@shared/jukebox";
import { PixelSprite } from "@/components/Crowd";
import { GbWindow } from "@/components/GbWindow";
import { isCancelKey, isConfirmKey, KEY_DIRS } from "@/game/keys";
import { vinyl } from "@/game/vinyl";
import { useRecordStatus } from "@/hooks/useJukebox";
import { useNow } from "@/hooks/useNow";
import { readApiError } from "@/lib/api";
import { needleAt } from "@/lib/jukebox";
import { sleevesOf, stepTo } from "@/lib/records";
import { SHELF, type ShelfRecord } from "@/lib/shelf";
import { playCue, recordDurationMs } from "@/lib/sound";

const EMPTY_SHELF =
  "The shelf is bare. Drop a record into the repo and redeploy — that is the whole trick.";

const NO_METADATA =
  "That record will not spin. The file is not where the shelf says it is.";

const REFUSED = "The cabinet would not take it. Try again in a moment.";

const SECOND_MS = 1000;

const CROWN = [0, 1, 2, 3, 4, 5, 6];

function label(record: ShelfRecord): string {
  return record.artist === null
    ? record.title
    : `${record.artist} — ${record.title}`;
}

export function JukeboxDialog({
  jukebox,
  onClose,
}: {
  jukebox: JukeboxState;
  onClose: () => void;
}) {
  const count = SHELF.length;
  const [at, setAt] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const pending = useRef<Promise<number | null> | null>(null);

  const step = useCallback(
    (delta: number) => {
      if (count === 0) return;
      playCue("blip");
      setAt((held) => stepTo(count, held, delta));
    },
    [count],
  );

  const faced = SHELF[at];
  // Through `useNow`, or a selector held open across the natural end of a record goes on
  // printing it and leaves STOP enabled: nothing else re-renders this box on a schedule.
  const now = useNow(SECOND_MS);
  const playingId = nowPlaying(jukebox, now)?.trackId ?? null;
  const status = useRecordStatus();
  const needle = needleAt(jukebox, now, status);

  const press = useCallback(async (body: RequestInit) => {
    setNote(null);
    const res = await fetch("/api/jukebox", body);
    if (!res.ok) setNote(await readApiError(res, REFUSED));
  }, []);

  // The needle drop resolves BEFORE the town hears anything, and the wait it covers is a
  // real one: the press carries a duration this screen has to read off the file first.
  const dropNeedle = useCallback(() => {
    if (faced === undefined || dropping) return;
    pending.current = recordDurationMs(faced.url);
    setDropping(true);
  }, [dropping, faced]);

  const landed = useCallback(() => {
    setDropping(false);
    const waiting = pending.current;
    pending.current = null;
    if (faced === undefined || waiting === null) return;
    // Held from the arm landing until the route answers, because the town does not know
    // about the press yet: without it the arm would lift for the round trip and drop again
    // when the socket caught up, which reads as a bounced needle.
    setCommitting(true);
    void (async () => {
      try {
        const durationMs = await waiting;
        if (durationMs === null) {
          setNote(NO_METADATA);
          return;
        }
        await press({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackId: faced.id, durationMs }),
        });
      } finally {
        // `finally`, or a press that never answers leaves the arm resting on a record the
        // town is not playing, with nothing on screen able to lift it again.
        setCommitting(false);
      }
    })();
  }, [faced, press]);

  const stop = useCallback(() => {
    void press({ method: "DELETE" });
  }, [press]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const dir = KEY_DIRS[event.key];
      if (dir === "left" || dir === "right") {
        event.preventDefault();
        step(dir === "left" ? -1 : 1);
        return;
      }
      if (isConfirmKey(event.key)) {
        event.preventDefault();
        dropNeedle();
        return;
      }
      if (isCancelKey(event.key)) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [dropNeedle, onClose, step]);

  const pose = dropping
    ? "dropping"
    : committing || needle !== "parked"
      ? "down"
      : "parked";

  return (
    <GbWindow title="Jukebox" onClose={onClose}>
      <div className="gb-jukebox" data-testid="jukebox">
        <div
          className="gb-juke-cabinet"
          data-needle={needle}
          data-testid="jukebox-cabinet"
        >
          <div className="gb-juke-crown" aria-hidden="true">
            {CROWN.map((bulb) => (
              <span
                key={bulb}
                className="gb-juke-bulb"
                style={{ animationDelay: `${(bulb * 0.11).toFixed(2)}s` }}
              />
            ))}
          </div>

          <div className="gb-juke-marquee">
            {faced === undefined ? (
              <p className="gb-jukebox-line" data-testid="jukebox-empty">
                {EMPTY_SHELF}
              </p>
            ) : (
              <>
                <p className="gb-jukebox-artist" data-testid="jukebox-artist">
                  {faced.artist ?? " "}
                </p>
                <p className="gb-jukebox-title" data-testid="jukebox-title">
                  {faced.title}
                </p>
              </>
            )}
          </div>

          <div className="gb-juke-deck">
            <span className="gb-juke-platter" aria-hidden="true" />
            <PixelSprite
              sprite={vinyl()}
              className="gb-juke-disc"
              testId="jukebox-disc"
            />
            <span
              className="gb-juke-arm"
              data-pose={pose}
              data-testid="jukebox-arm"
              onAnimationEnd={landed}
            />
          </div>

          <div className="gb-shelf" data-testid="jukebox-shelf">
            {sleevesOf(count, at).map((sleeve) => {
              const record = SHELF[sleeve.index];
              if (record === undefined) return null;
              return (
                <button
                  key={sleeve.index}
                  type="button"
                  className="gb-sleeve"
                  data-testid={`jukebox-sleeve-${String(sleeve.step)}`}
                  data-faced={sleeve.step === 0}
                  aria-label={
                    sleeve.step === 0
                      ? `Facing you: ${label(record)}`
                      : `Step to ${label(record)}`
                  }
                  disabled={sleeve.step === 0}
                  onClick={() => {
                    step(sleeve.step);
                  }}
                  style={{
                    left: `${sleeve.leftPct.toFixed(3)}%`,
                    transform: `translateX(-50%) scale(${sleeve.scale.toFixed(3)})`,
                    opacity: sleeve.opacity.toFixed(3),
                    zIndex: sleeve.z,
                  }}
                >
                  <PixelSprite
                    sprite={vinyl()}
                    className="gb-vinyl"
                    testId={`jukebox-vinyl-${String(sleeve.step)}`}
                  />
                </button>
              );
            })}
          </div>

          <span className="gb-juke-grille" aria-hidden="true" />

          <div className="gb-jukebox-controls">
            <button
              type="button"
              className="gb-btn px-2"
              aria-label="Previous record"
              disabled={count === 0}
              onClick={() => {
                step(-1);
              }}
            >
              ‹
            </button>
            <button
              type="button"
              className="gb-btn"
              data-testid="jukebox-play"
              disabled={count === 0 || dropping}
              onClick={dropNeedle}
            >
              {dropping ? "DROPPING" : "PLAY"}
            </button>
            <button
              type="button"
              className="gb-btn"
              data-testid="jukebox-stop"
              disabled={playingId === null}
              onClick={stop}
            >
              STOP
            </button>
            <button
              type="button"
              className="gb-btn px-2"
              aria-label="Next record"
              disabled={count === 0}
              onClick={() => {
                step(1);
              }}
            >
              ›
            </button>
          </div>
        </div>

        <p className="gb-jukebox-line" data-testid="jukebox-note">
          {note ??
            (playingId === null
              ? "NOTHING ON"
              : `${needle === "cueing" ? "CUEING" : "ON"}: ${playingId}`)}
        </p>
      </div>
    </GbWindow>
  );
}
