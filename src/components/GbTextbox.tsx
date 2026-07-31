import type { ReactNode } from "react";

/** Unlike `GbWindow` it lives INSIDE the screen, so it must be inside `.gb-lcd-frame`. */
export function GbTextbox({
  children,
  more = false,
}: {
  children: ReactNode;
  more?: boolean;
}) {
  return (
    <div className="gb-textbox">
      {children}
      {more && (
        <span className="gb-textbox-more" aria-hidden="true">
          ▼
        </span>
      )}
    </div>
  );
}
