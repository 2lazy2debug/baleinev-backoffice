"use client";

import { useEffect } from "react";
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
export function Modal({ open, onClose, title, size = "md", mobileFullScreen = false, children, footer }: ModalProps) {
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
          "w-full overflow-y-auto border border-[var(--line)] bg-[var(--panel)] p-6 shadow-lg",
          mobileFullScreen ? "h-full rounded-none sm:h-auto sm:rounded-3xl" : "rounded-3xl",
          sizeClasses[size],
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
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
        {children}
        {footer ? <div className="mt-6 flex flex-wrap items-center justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
