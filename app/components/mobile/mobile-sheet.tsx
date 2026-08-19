"use client";

import { useEffect } from "react";

/**
 * A bottom sheet — the mobile counterpart of <Modal>, anchored to the bottom of
 * the viewport instead of centred. Same dismissal contract as Modal: Escape, a
 * tap on the backdrop, or an explicit close control inside `children`.
 *
 * The sheet never stacks: a "second level" (Apps → other apps) swaps the sheet's
 * own content, so there is only ever one of these mounted.
 */
type MobileSheetProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function MobileSheet({ open, onClose, children }: MobileSheetProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex animate-fade-in flex-col justify-end bg-black/60 lg:hidden"
      onClick={onClose}
    >
      <div
        className="max-h-[78vh] animate-sheet-up overflow-y-auto rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--panel-strong)] px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Drag handle — it does not drag, it says "this came from the bottom". */}
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--line)]" />
        {children}
      </div>
    </div>
  );
}
