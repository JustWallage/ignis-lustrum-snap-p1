import { useCallback, useEffect, useRef, useState } from "react";
import { nowPlaying, type JukeboxState } from "@shared/jukebox";
import { PixelSprite } from "@/components/Crowd";
import { GbWindow } from "@/components/GbWindow";
import { isCancelKey, isConfirmKey, KEY_DIRS } from "@/game/keys";
import { vinyl } from "@/game/vinyl";
import { useNow } from "@/hooks/useNow";
import { readApiError } from "@/lib/api";
import { sleevesOf, stepTo } from "@/lib/records";
import { SHELF, type ShelfRecord } from "@/lib/shelf";
import { playCue, recordDurationMs } from "@/lib/sound";

const EMPTY_SHELF =
  "The shelf is bare. Drop a record into the repo and redeploy — that is the whole trick.";

const NO_METADATA =
  "That record will not spin. The file is not where the shelf says it is.";

const REFUSED = "The cabinet would not take it. Try again in a moment.";

const SECOND_MS = 1000;

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
  const playingId = nowPlaying(jukebox, useNow(SECOND_MS))?.trackId ?? null;

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
    void (async () => {
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

  return (
    <GbWindow title="Jukebox" onClose={onClose}>
      <div className="gb-jukebox" data-testid="jukebox">
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
          {dropping && (
            <span
              className="gb-needle"
              data-testid="jukebox-needle"
              onAnimationEnd={landed}
            />
          )}
        </div>

        {faced === undefined ? (
          <p className="gb-jukebox-line" data-testid="jukebox-empty">
            {EMPTY_SHELF}
          </p>
        ) : (
          <>
            <p className="gb-jukebox-artist" data-testid="jukebox-artist">
              {faced.artist ?? " "}
            </p>
            <p className="gb-jukebox-title" data-testid="jukebox-title">
              {faced.title}
            </p>
          </>
        )}

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

        <p className="gb-jukebox-line" data-testid="jukebox-note">
          {note ?? (playingId === null ? "NOTHING ON" : `ON: ${playingId}`)}
        </p>
      </div>
    </GbWindow>
  );
}
