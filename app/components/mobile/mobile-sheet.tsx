"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Imported from the leaf module, not the `@/components/ui` barrel: <PageHeader>
// pulls the account menu in, and the account menu pulls this in — going
// through the barrel would close that loop back onto PageHeader itself.
import { cn } from "@/components/ui/cn";

/**
 * A bottom sheet — the mobile counterpart of <Modal>, anchored to the bottom of
 * the viewport instead of centred. Same dismissal contract as Modal (Escape, a
 * tap on the backdrop, an explicit close control inside `children`), plus the
 * one gesture a phone expects from a sheet: a drag on its top edge.
 *
 * The handle is the whole grab zone, and it has two detents rather than one:
 *
 *   drag up   → the sheet goes full height, up to the top of the screen
 *   drag down → full height falls back to the default height; the default
 *               height, dragged low enough, closes
 *
 * so the same gesture that opens the sheet all the way also puts it away, and
 * nothing is ever dismissed by a stray few pixels of travel.
 *
 * The sheet never stacks: a sheet with levels swaps its own content instead of
 * mounting a second one.
 */
type MobileSheetProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

/** How far down the sheet must travel before releasing it gives way. */
const CLOSE_DISTANCE = 88;
/** How far up it must travel before releasing it goes full height. */
const EXPAND_DISTANCE = 44;

export function MobileSheet({ open, onClose, children }: MobileSheetProps) {
  if (!open || typeof document === "undefined") {
    return null;
  }
  // Into <body>, for the same reason <Modal> does it: the account menu opens from
  // <PageHeader>, which is `sticky z-20` and so a stacking context of its own — a
  // sheet rendered inside it would paint below the bottom bar.
  //
  // The surface only exists while the sheet is open, so every opening starts at
  // the default height instead of wherever the last drag left it — no reset.
  return createPortal(<SheetSurface onClose={onClose}>{children}</SheetSurface>, document.body);
}

function SheetSurface({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    startY.current = event.clientY;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) {
      return;
    }
    const delta = event.clientY - startY.current;
    // Downward travel is 1:1 — the sheet follows the finger. Upward travel is
    // capped: there is nowhere to go but the next detent, so it lifts just far
    // enough to say "let go and I go up".
    setDragY(delta >= 0 ? delta : isExpanded ? 0 : Math.max(delta, -EXPAND_DISTANCE));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) {
      return;
    }
    const delta = event.clientY - startY.current;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsDragging(false);
    setDragY(0);

    if (delta > CLOSE_DISTANCE) {
      if (isExpanded) {
        setIsExpanded(false);
      } else {
        onClose();
      }
    } else if (delta < -EXPAND_DISTANCE) {
      setIsExpanded(true);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex animate-fade-in flex-col justify-end bg-black/60 lg:hidden"
      onClick={onClose}
    >
      <div
        className={cn(
          "flex animate-sheet-up flex-col overflow-hidden rounded-t-4xl border border-b-0 border-[var(--line)]",
          "bg-[var(--panel-strong)] px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]",
          isExpanded ? "h-[100dvh] pt-[env(safe-area-inset-top)]" : "max-h-[78vh]",
          isDragging ? null : "transition-transform duration-150 ease-out",
        )}
        style={{ transform: `translateY(${dragY}px)` }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* The grab zone: the pill is the affordance, the strip around it is the
            target — `touch-none` so the gesture is the sheet's, not the browser's. */}
        <div
          className="shrink-0 cursor-grab touch-none py-3 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto h-1 w-9 rounded-full bg-[var(--line)]" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

type MobileSheetRowProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** Where the row leads. Omitted for a row that acts in place (sign out). */
  href?: string;
  onClick?: () => void;
  /** Right-hand hint — the edition this row would switch, the current language. */
  value?: React.ReactNode;
  /** The row's route is the one being shown. */
  active?: boolean;
  /** A count bubble on the icon, for a row whose app is waiting on the user. */
  badge?: number;
  tone?: "default" | "danger";
};

/**
 * The one row recipe inside a sheet: an icon tile, a label, an optional value,
 * and a 56px tap target. Every sheet in the app is a list of these — the app
 * drawer, the account menu — so a sheet never invents its own list styling.
 */
export function MobileSheetRow({
  icon: Icon,
  label,
  href,
  onClick,
  value,
  active = false,
  badge = 0,
  tone = "default",
}: MobileSheetRowProps) {
  const className = cn(
    "flex min-h-14 w-full items-center gap-3 border-b border-[var(--line)] py-3 text-left text-sm last:border-b-0",
    tone === "danger" ? "text-rose-300" : null,
  );

  const body = (
    <>
      <span
        className={cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--panel)]",
          tone === "danger" ? "text-rose-300" : active ? "text-[var(--accent)]" : "text-[var(--muted)]",
        )}
      >
        <Icon className="h-4 w-4" />
        {badge > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-3xs font-bold text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {value ? <span className="shrink-0 text-xs text-[var(--muted)]">{value}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className} aria-current={active ? "page" : undefined}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
