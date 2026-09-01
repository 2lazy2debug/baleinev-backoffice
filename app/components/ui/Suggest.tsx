"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "./cn";
import { Input } from "./Input";
import { type ControlSize } from "./control";

export type SuggestOption = {
  /** What lands in the field when the row is picked. */
  value: string;
  /** What the row reads as. Defaults to `value`. */
  label?: string;
  /** Secondary text on the row — the other half of a pair, a country for a prefix. */
  hint?: string;
};

type SuggestProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size" | "value" | "onChange" | "list"
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** A closed list, filtered here on value + label + hint. */
  options?: SuggestOption[];
  /** An open list, fetched per query. Debounced, and stale answers are dropped. */
  loadOptions?: (query: string) => Promise<SuggestOption[]>;
  /** Called with the picked row, for a field that fills another one alongside it. */
  onPick?: (option: SuggestOption) => void;
  size?: ControlSize;
  maxOptions?: number;
  debounceMs?: number;
  /** Propose as soon as the field has focus, before anything is typed. */
  openOnFocus?: boolean;
};

/**
 * A text field that *proposes* values without imposing them.
 *
 * Every use of it in this app is a field where a table of known values exists
 * but is not the whole world: a Swiss postal code proposes its localities, a
 * locality proposes its postal codes, a dialling prefix proposes its countries.
 * Typing anything else is always allowed — the field is an <Input>, and the
 * list only ever fills it in faster.
 *
 * The dropdown renders into <body>, positioned from the input's own rect,
 * because these fields sit inside table cells and modals whose frames clip
 * (`overflow-hidden` on <Panel>, `overflow-auto` on <Table>). Same reason
 * <Modal> portals: a list that is only sometimes visible is worse than none.
 */
export function Suggest({
  value,
  onValueChange,
  options,
  loadOptions,
  onPick,
  size = "md",
  maxOptions = 8,
  debounceMs = 150,
  openOnFocus = false,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: SuggestProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loaded, setLoaded] = useState<SuggestOption[]>([]);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; below: boolean } | null>(null);

  const staticMatches = useMemo(() => {
    if (!options) {
      return null;
    }
    const query = value.trim().toLowerCase();
    const matches = query
      ? options.filter((option) =>
          [option.value, option.label, option.hint].some((text) => text?.toLowerCase().includes(query)),
        )
      : options;
    return matches.slice(0, maxOptions);
  }, [options, value, maxOptions]);

  const matches = staticMatches ?? loaded;

  // The async list. A counter, not an AbortController: the caller may not be
  // fetching at all, and what matters is only that an older answer never
  // overwrites a newer one.
  const requestId = useRef(0);
  useEffect(() => {
    if (!loadOptions || !isOpen) {
      return;
    }

    const query = value.trim();
    const id = ++requestId.current;

    const timer = setTimeout(() => {
      // An empty query only asks for proposals when the field opens on focus;
      // otherwise there is nothing to propose and the list is emptied instead.
      if (!query && !openOnFocus) {
        setLoaded([]);
        return;
      }

      loadOptions(query)
        .then((results) => {
          if (id === requestId.current) {
            setLoaded(results.slice(0, maxOptions));
          }
        })
        .catch(() => {
          if (id === requestId.current) {
            setLoaded([]);
          }
        });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [loadOptions, value, isOpen, openOnFocus, maxOptions, debounceMs]);

  const measure = useCallback(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    const box = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - box.bottom;
    const below = spaceBelow > 200 || spaceBelow > box.top;
    setRect({
      top: below ? box.bottom + 4 : box.top - 4,
      left: box.left,
      width: box.width,
      below,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    measure();
    // Capture phase: the field can be inside a scrolling modal or table, and
    // those scroll events do not bubble to the window.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [isOpen, measure]);

  function close() {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function pick(option: SuggestOption) {
    onValueChange(option.value);
    onPick?.(option);
    close();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);

    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (matches.length === 0) {
        return;
      }
      event.preventDefault();
      setIsOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + step + matches.length) % matches.length);
      return;
    }
    if (event.key === "Enter" && isOpen && activeIndex >= 0 && matches[activeIndex]) {
      // Otherwise the pick submits the form the field sits in.
      event.preventDefault();
      pick(matches[activeIndex]);
    }
  }

  const showList = isOpen && matches.length > 0 && rect !== null;

  return (
    <>
      <Input
        {...props}
        ref={inputRef}
        size={size}
        className={className}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(event) => {
          onValueChange(event.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={(event) => {
          onFocus?.(event);
          if (openOnFocus || event.target.value.trim()) {
            setIsOpen(true);
          }
        }}
        onBlur={(event) => {
          onBlur?.(event);
          close();
        }}
        onKeyDown={handleKeyDown}
      />

      {showList && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              className="fixed z-50 max-h-64 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] py-1 shadow-lg"
              style={{
                left: rect.left,
                width: rect.width,
                ...(rect.below ? { top: rect.top } : { bottom: window.innerHeight - rect.top }),
              }}
              // Keeps the field focused, so `onBlur` never closes the list out
              // from under the click that is picking a row.
              onMouseDown={(event) => event.preventDefault()}
            >
              {matches.map((option, index) => (
                <li key={`${option.value}-${option.label ?? ""}-${option.hint ?? ""}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onClick={() => pick(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-xs",
                      index === activeIndex ? "bg-[var(--panel)] text-[var(--ink)]" : "text-[var(--muted)]",
                    )}
                  >
                    <span className="truncate font-medium text-[var(--ink)]">{option.label ?? option.value}</span>
                    {option.hint ? <span className="shrink-0 truncate">{option.hint}</span> : null}
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
