import { useCallback, useState, type SyntheticEvent } from "react";
import {
  commentListSchema,
  commentsPath,
  type Comment,
  type CommentSubject,
} from "@shared/api";
import { GbButton } from "@/components/GbPending";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";

/** One thread, whatever it hangs off: a snap or a drawn sprite. A second component
 * differing only in the noun is how the two would drift apart on who may delete what. */
export function CommentThread({
  subject,
  id,
}: {
  subject: CommentSubject;
  id: number;
}) {
  const { user, isAdmin } = useAuth();
  const path = commentsPath(subject, id);
  const comments = useCachedFetch(path, commentListSchema);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const refresh = useCallback(() => {
    comments.mutate();
  }, [comments]);
  useRealtimeEvents(refresh);

  const addComment = useCallback(
    async (event: SyntheticEvent) => {
      event.preventDefault();
      // Belt as well as braces: Enter in the field can still submit a form whose
      // button is disabled.
      if (sending || body.trim() === "") return;
      setSending(true);
      try {
        await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim() }),
        });
        setBody("");
        refresh();
      } finally {
        setSending(false);
      }
    },
    [path, body, refresh, sending],
  );

  const deleteComment = useCallback(
    async (comment: Comment) => {
      setDeleting(comment.id);
      try {
        await fetch(`${path}/${String(comment.id)}`, { method: "DELETE" });
        refresh();
      } finally {
        setDeleting(null);
      }
    },
    [path, refresh],
  );

  return (
    <section
      className="space-y-2 border-t-2 border-[#071821] pt-2"
      data-testid="comment-thread"
    >
      <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
        {(comments.data?.comments ?? []).map((comment) => (
          <li key={comment.id} className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="font-bold uppercase">{comment.author.name}</span>{" "}
              {comment.body}
            </span>
            {(comment.author.id === user?.id || isAdmin) && (
              <GbButton
                aria-label="Delete comment"
                className="opacity-60 hover:opacity-100"
                busy={deleting === comment.id}
                onClick={() => {
                  void deleteComment(comment);
                }}
              >
                ×
              </GbButton>
            )}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          void addComment(event);
        }}
        className="flex gap-2"
      >
        <input
          className="gb-input flex-1"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          placeholder="Add a comment…"
          maxLength={1000}
        />
        {/* Busy through the refetch as well as the POST: the comment is not on
            screen until the list comes back, and that gap is the half of the
            wait that used to be invisible. Not the FIRST fetch though — the
            thread arriving is what the list itself is waiting for, and a Send
            button that spins before anyone has typed says nothing useful. */}
        <GbButton
          type="submit"
          className="gb-btn px-3"
          busy={sending || (comments.busy && !comments.loading)}
          disabled={body.trim() === ""}
        >
          Send
        </GbButton>
      </form>
    </section>
  );
}
