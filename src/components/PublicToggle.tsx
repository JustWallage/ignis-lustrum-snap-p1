import { useCallback, useState } from "react";
import type { DayResult } from "@shared/api";
import { useAuth } from "@/context/AuthContext";
import { readApiError } from "@/lib/api";

const SHARE_REFUSED = "The page would not take it. Try again in a moment.";

const VETO_REFUSED = "The veto would not stick. Try again in a moment.";

/** Said out loud rather than left to the greyed-out switch: a photograph on the public
 * page is out of the town's hands, and a reader deciding has to be told that before
 * they press rather than after. */
const PUBLISHED =
  "On the public page — anyone with the link can see it, and a copy already downloaded cannot be taken back.";

const PRIVATE = "Only the town can see this one.";

const VETOED = "The operator has kept this one off the public page.";

export function PublicToggle({
  result,
  onChanged,
}: {
  result: Pick<DayResult, "photoId" | "uploader" | "shared" | "vetoed">;
  onChanged: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mine = user !== null && user.id === result.uploader.id;

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

  const id = String(result.photoId);
  return (
    <span className="arc-public" data-testid="public-toggle">
      <button
        type="button"
        className="gb-btn px-2"
        data-testid="public-share"
        aria-pressed={result.shared}
        disabled={busy}
        onClick={() => {
          void send(
            `/api/photos/${id}/public`,
            { shared: !result.shared },
            SHARE_REFUSED,
          );
        }}
      >
        {result.shared ? "PUBLIC" : "PRIVATE"}
      </button>
      {isAdmin && (
        <button
          type="button"
          className="gb-btn px-2"
          data-testid="public-veto"
          aria-pressed={result.vetoed}
          disabled={busy}
          onClick={() => {
            void send(
              `/api/admin/photos/${id}/veto`,
              { vetoed: !result.vetoed },
              VETO_REFUSED,
            );
          }}
        >
          {result.vetoed ? "VETOED" : "VETO"}
        </button>
      )}
      <span className="arc-public-note" data-testid="public-note">
        {result.vetoed ? VETOED : result.shared ? PUBLISHED : PRIVATE}
      </span>
      {error !== "" && (
        <span className="gb-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
