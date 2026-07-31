import { useAuth } from "@/context/AuthContext";

/**
 * ASKS to delete; it never deletes. The question is a `confirmChain` in the LCD's
 * dialogue box, which lives under the modal layer — so the shell has to be the one
 * that asks, and both viewers hand the id up to it (#93).
 *
 * Who may delete is decided here rather than at each viewer, and the route decides it
 * again: this is the button being honest, not the enforcement.
 */
export function DeleteSnapButton({
  uploaderId,
  onDelete,
}: {
  uploaderId: number | null;
  onDelete: () => void;
}) {
  const { user, isAdmin } = useAuth();
  // `null` is a MASKED uploader, which is nobody and can never match the viewer — both
  // sides are spelled out rather than left to compare two absences.
  const mine = user !== null && uploaderId === user.id;
  if (!mine && !isAdmin) return null;
  return (
    <button
      type="button"
      className="gb-btn ml-auto px-2 py-0.5"
      onClick={onDelete}
    >
      Delete
    </button>
  );
}
