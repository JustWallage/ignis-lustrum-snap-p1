import { useCallback, useEffect, useMemo, useState } from "react";
import { publicGallerySchema, type PublicPhoto } from "@shared/api";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { daysOf, stepThrough } from "@/lib/gallery";
import { ratingText } from "@/lib/rating";

const TITLE = "Ignis Snaps";

const BLURB =
  "Photographs from a fourteen-day contest between fourteen friends. Each day has a theme and a jury; what you see here is what the photographers chose to share.";

const EMPTY =
  "Nothing has been shared yet. Check back once the friends have picked their favourites.";

const FAILED = "The gallery could not be loaded. Try again in a moment.";

const NO_PAGES: readonly PublicPhoto[] = [];

/**
 * The public page, and the THIRD surface with a look of its own — the archive and the
 * operator's console are the other two, and like both it is quarantined by naming:
 * every class here is `pub-` and used nowhere else. It is not a Game Boy on purpose.
 * Family reading it have no idea what the shell is, and the job of this page is the
 * photographs.
 */
export function PublicGallery() {
  const gallery = useCachedFetch("/api/public/gallery", publicGallerySchema);
  const [open, setOpen] = useState<number | null>(null);

  const photos = useMemo(
    () => gallery.data?.photos ?? NO_PAGES,
    [gallery.data],
  );
  const days = useMemo(() => daysOf(photos), [photos]);
  const shown = photos.find((photo) => photo.id === open);

  const step = useCallback(
    (delta: number) => {
      setOpen((held) =>
        held === null ? null : stepThrough(photos, held, delta),
      );
    },
    [photos],
  );

  useEffect(() => {
    if (shown === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shown, step]);

  return (
    <div className="pub-page" data-testid="gallery">
      <header className="pub-head">
        <h1 className="pub-title">{TITLE}</h1>
        <p className="pub-blurb">{BLURB}</p>
      </header>

      {gallery.error !== null ? (
        <p className="pub-empty" role="alert" data-testid="gallery-error">
          {FAILED}
        </p>
      ) : gallery.loading ? (
        <p className="pub-empty" data-testid="gallery-loading">
          Loading…
        </p>
      ) : days.length === 0 ? (
        <p className="pub-empty" data-testid="gallery-empty">
          {EMPTY}
        </p>
      ) : (
        days.map((group) => (
          <section
            className="pub-day"
            key={group.day}
            data-testid="gallery-day"
          >
            <h2 className="pub-day-head">
              <span className="pub-day-no">Day {group.day}</span>
              <span className="pub-theme">{group.theme}</span>
            </h2>
            <ul className="pub-grid">
              {group.photos.map((photo) => (
                <li className="pub-tile" key={photo.id}>
                  <button
                    type="button"
                    className="pub-open"
                    data-testid="gallery-tile"
                    aria-label={`Open ${photo.photographer}'s photograph from day ${String(photo.day)}`}
                    onClick={() => {
                      setOpen(photo.id);
                    }}
                  >
                    <img
                      className="pub-photo"
                      src={photo.url}
                      alt={`A photograph by ${photo.photographer}`}
                      loading="lazy"
                    />
                  </button>
                  <p className="pub-meta">
                    <span className="pub-who">{photo.photographer}</span>
                    {photo.score !== null && (
                      <span className="pub-score" data-testid="gallery-score">
                        {ratingText(photo.score)}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {shown !== undefined && (
        <div
          className="pub-light"
          role="dialog"
          aria-modal="true"
          aria-label={`${shown.photographer}, day ${String(shown.day)}`}
          data-testid="gallery-lightbox"
          // The backdrop closes and the frame inside it does not, which is why the stop
          // is on the frame rather than a check of the event target: a click that began
          // on the picture and ended on the backdrop is still a click on the picture.
          onClick={() => {
            setOpen(null);
          }}
        >
          <div
            className="pub-light-frame"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <img
              className="pub-light-photo"
              src={shown.url}
              alt={`A photograph by ${shown.photographer}`}
            />
            <p className="pub-light-meta">
              <span className="pub-who">{shown.photographer}</span>
              <span>
                Day {shown.day} · {shown.theme}
              </span>
              {shown.score !== null && (
                <span className="pub-score">{ratingText(shown.score)}</span>
              )}
            </p>
            <div className="pub-light-nav">
              <button
                type="button"
                className="pub-btn"
                aria-label="Previous photograph"
                onClick={() => {
                  step(-1);
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="pub-btn"
                data-testid="gallery-close"
                onClick={() => {
                  setOpen(null);
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="pub-btn"
                aria-label="Next photograph"
                onClick={() => {
                  step(1);
                }}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
