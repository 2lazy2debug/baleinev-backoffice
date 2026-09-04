"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "./cn";
import { IconButton } from "./IconButton";
import { type ControlSize } from "./control";

export type MenuOption = {
  value: string;
  label: string;
  /** Secondary text on the row — what picking it will actually do. */
  hint?: string;
};

type MenuProps = {
  /** Required: the trigger is icon-only, so this is its title and aria-label. */
  label: string;
  icon: React.ReactNode;
  options: MenuOption[];
  onSelect: (value: string) => void;
  size?: ControlSize;
  disabled?: boolean;
};

/**
 * A short list of actions hanging off one icon button.
 *
 * Not a <Select>: nothing here is a value being held, and there is no field to
 * hold it — picking a row *does* something and the menu is gone. The one in the
 * app today offers the conversions of a unit.
 *
 * It renders into <body> and positions itself from the trigger's rect, for the
 * same reason <Suggest> does: these triggers sit inside modals and panels whose
 * frames clip, and a list that is only sometimes visible is worse than none.
 */
export function Menu({ label, icon, options, onSelect, size = "md", disabled = false }: MenuProps) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; right: number; below: boolean } | null>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const box = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - box.bottom;
    const below = spaceBelow > 220 || spaceBelow > box.top;

    // Anchored by its right edge: the trigger is the last control in its row, so
    // a list hung from the left would run off the dialog it was opened in.
    setRect({
      top: below ? box.bottom + 4 : box.top - 4,
      right: window.innerWidth - box.right,
      below,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    measure();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    // The list is a portal, so "outside" has to mean outside *both* it and the
    // trigger. Closing on a mousedown that landed on a row would unmount that
    // row before its click could fire — the menu would shut having done nothing.
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    // Capture phase: the trigger can sit in a scrolling modal or table, and
    // those scroll events never reach the window.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointerDown);

    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, measure]);

  return (
    <>
      <IconButton
        ref={triggerRef}
        size={size}
        tone="accent"
        label={label}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
      </IconButton>

      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="menu"
              className="fixed z-50 max-h-64 min-w-48 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] py-1 shadow-lg"
              style={{
                right: rect.right,
                ...(rect.below ? { top: rect.top } : { bottom: window.innerHeight - rect.top }),
              }}
            >
              {options.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelect(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-xs",
                      "text-[var(--ink)] hover:bg-[var(--panel)]",
                    )}
                  >
                    <span className="truncate font-medium">{option.label}</span>
                    {option.hint ? (
                      <span className="shrink-0 truncate text-[var(--muted)]">{option.hint}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
