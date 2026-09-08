"use client";

import { useCallback, useSyncExternalStore } from "react";

import { DEFAULT_COLUMNS, normalizeColumns, type TillColumns } from "@/lib/pos-layout";

/**
 * How many columns the till draws its grid in — a **device** setting, never a
 * template or session one. The same session is served to a phone in the crowd
 * and an iPad on the counter, and those two want different densities, so the
 * choice lives in this browser's `localStorage` and reaches nobody else.
 *
 * Since a template is a stack rather than a grid, columns decide the page
 * break too: the page is `columns × POS_ROWS` slots, so a wider device fits
 * more of the same stack on one page. The arithmetic is `lib/pos-layout.ts`;
 * this file is only where the choice is remembered.
 */

export { COLUMN_CHOICES, DEFAULT_COLUMNS, normalizeColumns, type TillColumns } from "@/lib/pos-layout";

export const COLUMNS_STORAGE_KEY = "pos:columns";

/**
 * Tailwind needs the whole class name in the source, so the count maps to a
 * static class instead of being interpolated into `grid-cols-${n}`.
 */
export const columnClasses: Record<TillColumns, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

// --- the store -------------------------------------------------------------
// `localStorage` is not React state, so it is read through a store rather than
// an effect: the server and the first client render both answer DEFAULT_COLUMNS
// (nothing else would hydrate), and React swaps in the stored count right after.

let cached: TillColumns | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // A second tab is the same device: a change over there applies here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === COLUMNS_STORAGE_KEY) {
      cached = null;
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): TillColumns {
  if (cached === null) {
    try {
      cached = normalizeColumns(window.localStorage.getItem(COLUMNS_STORAGE_KEY));
    } catch {
      // Storage blocked (private mode, an embedded webview) — the default draws fine.
      cached = DEFAULT_COLUMNS;
    }
  }
  return cached;
}

function getServerSnapshot(): TillColumns {
  return DEFAULT_COLUMNS;
}

/** The column count this device sells at, remembered between sessions. */
export function useTillColumns() {
  const columns = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const chooseColumns = useCallback((next: TillColumns) => {
    cached = next;
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, String(next));
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
    emit();
  }, []);

  return { columns, chooseColumns };
}
