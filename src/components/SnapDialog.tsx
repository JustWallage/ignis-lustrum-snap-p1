import { CaptionField } from "@/components/CaptionField";
import { DeleteSnapButton } from "@/components/DeleteSnapButton";
import { GbPlaceholder } from "@/components/GbPending";
import { GbWindow } from "@/components/GbWindow";
import { LikeButton } from "@/components/LikeButton";
import { CommentThread } from "@/components/CommentThread";
import { PublicToggle } from "@/components/PublicToggle";
import { usePhotoLike } from "@/hooks/usePhotoLike";
import { relativeTime } from "@/lib/format";
import { ratingText } from "@/lib/rating";

/** One snap on its own, reached by id with no list to page through. The archive's cards
 * open the big viewer instead. */
export function SnapDialog({
  id,
  onDelete,
  onClose,
}: {
  id: number;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  const like = usePhotoLike(id);
  const current = like.photo.data;

  return (
    <GbWindow title="Snap" onClose={onClose}>
      {current === undefined ? (
        <GbPlaceholder error={like.photo.error} loading={like.photo.loading} />
      ) : (
        <div className="space-y-3">
          <img
            src={current.url}
            alt="Snap"
            className="max-h-56 w-full border-2 border-[#071821] bg-[#071821] object-contain"
          />
          <p className="text-xs">
            {/* Null while the day is still being voted on: the server does not
                say whose snap this is, so neither does the screen. */}
            <span className="font-bold uppercase">
              {current.uploader?.name ?? "Anonymous"}
            </span>{" "}
            <span className="ml-2 opacity-60">
              {relativeTime(current.createdAt)}
            </span>
          </p>
          {/* Null until the day is out, for everyone including admins — so the
              absence of this line is the reveal not having happened rather than a
              snap nobody judged. */}
          {current.aiScore !== null && (
            <p
              className="ink-jury text-xs font-bold uppercase"
              data-testid="snap-rating"
            >
              Jury {ratingText(current.aiScore)}
            </p>
          )}
          {/* The decision belongs HERE as well as in the archive: a photographer knows
              whether a snap is for the family the moment they hand it in, and the
              archive is days away. It simply waits for the reveal, which the note under
              it says. */}
          <PublicToggle
            photoId={id}
            uploaderId={current.uploader?.id ?? null}
            shared={current.shared}
            vetoed={current.vetoed}
            onPublicPage={current.onPublicPage}
            onChanged={like.photo.mutate}
          />
          <div className="flex items-center gap-2">
            <LikeButton {...like} />
            <DeleteSnapButton
              uploaderId={current.uploader?.id ?? null}
              onDelete={() => {
                onDelete(id);
              }}
            />
          </div>
          {/* The caption takes the box the comment field used to have. This window is
              only ever your OWN snap — the jury's `See my snap`, or the one you have
              just handed in — so a field to comment on it was a field to sign your own
              photograph with, which is the thing the caption exists to spare you. The
              thread still READS: what your friends said about it is worth having. */}
          <CaptionField
            key={id}
            id={id}
            caption={current.caption}
            onSaved={like.photo.mutate}
          />
          <CommentThread subject="photo" id={id} canPost={false} />
        </div>
      )}
    </GbWindow>
  );
}
