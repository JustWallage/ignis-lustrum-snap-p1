import { useState } from "react";
import { GbWindow } from "@/components/GbWindow";

export function EventSnap({
  url,
  alt,
  testId,
  title,
}: {
  url: string;
  alt: string;
  testId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="gb-event-snap"
        aria-label={`${alt} — open full screen`}
        onClick={() => {
          setOpen(true);
        }}
      >
        <img src={url} alt={alt} data-testid={testId} />
      </button>
      {open && (
        <GbWindow
          title={title}
          shape="wide"
          onClose={() => {
            setOpen(false);
          }}
        >
          <img
            src={url}
            alt={alt}
            data-testid={`${testId}-full`}
            className="min-h-0 w-full flex-1 border-2 border-[#071821] bg-[#071821] object-contain"
          />
        </GbWindow>
      )}
    </>
  );
}
