import type { ReactNode } from "react";
import { Modal } from "@/components/Modal";

/** One total record rather than a `full` boolean beside `wide`: two of those can both be
 * passed, and a window that is wide AND full has no geometry to be. */
const SHAPES = {
  narrow: "max-w-sm",
  wide: "flex h-full max-w-3xl flex-col",
  full: "flex h-full flex-col",
} as const;

type Shape = keyof typeof SHAPES;

export function GbWindow({
  title,
  onClose,
  shape = "narrow",
  children,
}: {
  title: string;
  onClose: () => void;
  shape?: Shape;
  children: ReactNode;
}) {
  return (
    <Modal label={title} full={shape === "full"} onClose={onClose}>
      <div className={`gb-window w-full p-4 ${SHAPES[shape]}`}>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2 border-b-2 border-[#071821] pb-2">
          <h2 className="text-sm font-bold uppercase tracking-widest">
            {title}
          </h2>
          <button
            type="button"
            className="gb-btn px-2 py-0.5"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </Modal>
  );
}
