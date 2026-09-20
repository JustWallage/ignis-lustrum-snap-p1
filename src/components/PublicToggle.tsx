import { useCallback, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { readApiError } from "@/lib/api";

const SHARE_REFUSED = "The page would not take it. Try again in a moment.";

const VETO_REFUSED = "The veto would not stick. Try again in a moment.";

/** Said out loud rather than left to the switch: a photograph on the public page is out
 * of the town's hands, and a reader deciding has to be told that before they press
 * rather than after. */
const ON_THE_PAGE =
  "On the public page — anyone with the link can see it, and a copy already downloaded cannot be taken back.";

/** The upload's own case. Sharing is a decision a photographer may make the moment they
 * hand a snap in, and it simply does not take effect until the day is out — which they
 * are told here rather than left to wonder why the page is empty. */
const WAITING = "Shared. It goes on the public page when this day is revealed.";

const PRIVATE = "Only the town can see this one.";

const VETOED = "The operator has kept this one off the public page.";

/**
 * The ONE switch for the public page, on both surfaces that carry it: the archive's
 * viewer, where a photographer goes back over a revealed day, and the snap window they
 * land on the moment they hand one in. It reads `onPublicPage` off the WORKER rather
 * than ANDing the two flags itself, because the third condition is the day's reveal and
 * that gate has one owner.
 */
export function PublicToggle({
  photoId,
  uploaderId,
  shared,
  vetoed,
  onPublicPage,
  onChanged,
}: {
  photoId: number;
  uploaderId: number | null;
  shared: boolean;
  vetoed: boolean;
  onPublicPage: boolean;
  onChanged: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mine = user !== null && uploaderId === user.id;

  const send = useCallback(
    async (path: string, body: object, refused: string) => {
      setBusy(true);
      setError("");
      try {
        const res = await fetch(path, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setError(await readApiError(res, refused));
          return;
        }
        onChanged();
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  // Nothing at all for a friend who is neither the photographer nor the operator: this
  // is a decision, not a readout, and a switch somebody cannot flip is noise on a card
  // they are only looking at.
  if (!mine && !isAdmin) return null;

  const id = String(photoId);
  return (
    <span className="arc-public" data-testid="public-toggle">
      <button
        type="button"
        className="gb-btn px-2"
        data-testid="public-share"
        aria-pressed={shared}
        disabled={busy}
        onClick={() => {
          void send(
            `/api/photos/${id}/public`,
            { shared: !shared },
            SHARE_REFUSED,
          );
        }}
      >
        {shared ? "PUBLIC" : "PRIVATE"}
      </button>
      {isAdmin && (
        <button
          type="button"
          className="gb-btn px-2"
          data-testid="public-veto"
          aria-pressed={vetoed}
          disabled={busy}
          onClick={() => {
            void send(
              `/api/admin/photos/${id}/veto`,
              { vetoed: !vetoed },
              VETO_REFUSED,
            );
          }}
        >
          {vetoed ? "VETOED" : "VETO"}
        </button>
      )}
      <span className="arc-public-note" data-testid="public-note">
        {vetoed
          ? VETOED
          : onPublicPage
            ? ON_THE_PAGE
            : shared
              ? WAITING
              : PRIVATE}
      </span>
      {error !== "" && (
        <span className="gb-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
