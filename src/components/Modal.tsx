import { useEffect, useRef, type ReactNode } from "react";

/**
 * The app's ONE modal layer, and it is the browser's own: a native `<dialog>` opened with
 * `showModal()`, so it lives in the TOP LAYER, two stack in the order they opened,
 * everything behind is inert, and `cancel` fires on the topmost alone. No z-index.
 *
 * The geometry is in `.modal-layer` rather than utility classes because the `<dialog>`
 * reset is unlayered CSS and beats them: a `p-4` here would do nothing.
 */
export function Modal({
  label,
  full = false,
  onClose,
  children,
}: {
  label: string;
  full?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    // Closed on the way out so a re-mount can open again: `showModal()` on an open
    // dialog throws, and StrictMode mounts everything twice.
    return () => {
      element?.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      className={full ? "modal-layer is-full" : "modal-layer"}
      // Prevented so React stays the one thing that decides whether this is mounted,
      // rather than leaving an element the browser has closed behind in the tree.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // The layer fills the viewport, so a click on the dialog itself rather than a
      // descendant is a click outside whatever is in it.
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
