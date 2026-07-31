import type { ReactNode } from "react";
import { Modal } from "@/components/Modal";

export function GbWindow({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Modal label={title} onClose={onClose}>
      <div
        className={`gb-window w-full p-4 ${
          wide ? "flex h-full max-w-3xl flex-col" : "max-w-sm"
        }`}
      >
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
