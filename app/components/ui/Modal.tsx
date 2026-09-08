"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  full: "max-w-[95vw] max-h-[90vh]",
};

// Below `sm` a `mobileFullScreen` dialog *is* the screen, so its caps only start
// at `sm`. Without this the `full` size keeps its `max-h-[90vh]` on a phone and
// leaves a strip of page around a modal that was asked to take over. Tailwind
// only sees class strings it can read in the source, so these are spelled out
// rather than derived from the map above.
const mobileFullScreenSizeClasses: Record<ModalSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-3xl",
  full: "sm:max-w-[95vw] sm:max-h-[90vh]",
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  /** Edge-to-edge below `sm` — for modals that are the whole screen on a phone (Settings). */
  mobileFullScreen?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

// One modal implementation for the whole app — replaces both the two-div and
// flex-wrapper patterns found in the audit. Always shadow-lg, always Escape-to-close.
//
// It renders into <body> rather than where it is written. A dialog is opened from
// wherever its trigger lives — most often <PageHeader actions>, and that header is
// `sticky z-20`, which is a stacking context: a `z-40` overlay inside it still
// paints below the `z-30` mobile bottom bar. Out at the body there is nothing to
// be trapped by.
// Which dialogs are open, oldest first. A dialog may be opened from inside
// another one — the POS tile editor opens the article form over itself — and
// both would otherwise answer the same Escape and close together. Only the last
// one in this stack listens.
const openModals: string[] = [];

export function Modal({ open, onClose, title, size = "md", mobileFullScreen = false, children, footer }: ModalProps) {
  const id = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    openModals.push(id);

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && openModals[openModals.length - 1] === id) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const index = openModals.lastIndexOf(id);
      if (index >= 0) {
        openModals.splice(index, 1);
      }
    };
  }, [open, onClose, id]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-40 flex items-center justify-center bg-black/50",
        mobileFullScreen ? "p-0 sm:p-4" : "p-4",
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          // Title, body, footer: only the body scrolls, so a long dialog never
          // takes its close button or its Save away from the reader. `max-h-full`
          // is what makes that true for every size — a modal taller than the
          // viewport used to be clipped at both ends with nothing to scroll.
          "flex max-h-full w-full flex-col overflow-hidden border border-[var(--line)] bg-[var(--panel)] p-4 shadow-lg sm:p-6",
          mobileFullScreen ? "h-full rounded-none sm:h-auto sm:rounded-3xl" : "rounded-3xl",
          mobileFullScreen ? mobileFullScreenSizeClasses[size] : sizeClasses[size],
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3 sm:mb-5">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted)] transition hover:text-[var(--ink)] lg:mr-0 lg:h-8 lg:w-8"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* `min-h-0` so this can actually shrink inside the flex column — without
            it a long body pushes the footer off the bottom instead of scrolling. */}
        <div className="min-h-0 grow overflow-y-auto">{children}</div>
        {footer ? <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2 sm:mt-6">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
