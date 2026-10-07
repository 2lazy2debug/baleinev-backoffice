"use client";

import { useCallback, useSyncExternalStore } from "react";

import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { DEFAULT_JOURNAL_COLUMNS, normalizeJournalColumns, type JournalColumn } from "@/lib/journal-grid";

/**
 * Which columns the journal table draws — a per-browser preference, kept in
 * `localStorage` like the till's column count (`pos/till-columns.ts`). It is a
 * store rather than state so the header's picker and the table read the same
 * value without the page lifting it into a shared parent.
 */

export const JOURNAL_COLUMNS_STORAGE_KEY = "journal:columns";

/** A column's full name, as the picker lists it. Table headers may be shorter (`#`, `CC`). */
export function journalColumnLabel(column: JournalColumn, locale: Locale): string {
  const copy = dictionaries[locale].journal;
  const labels: Record<JournalColumn, string> = {
    sequenceNumber: copy.recordNumber,
    date: copy.date,
    budget: copy.budget,
    type: copy.type,
    amount: copy.amount,
    label: copy.label,
    referenceNumber: copy.reference,
    counterpart: copy.counterpart,
    account: copy.account,
    costCenter: copy.costCenter,
    balance: copy.balance,
  };
  return labels[column];
}

let cached: JournalColumn[] | null = null;
const listeners = new Set<() => void>();
const serverSnapshot: JournalColumn[] = [...DEFAULT_JOURNAL_COLUMNS];

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === JOURNAL_COLUMNS_STORAGE_KEY) {
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

function getSnapshot(): JournalColumn[] {
  if (cached === null) {
    try {
      cached = normalizeJournalColumns(window.localStorage.getItem(JOURNAL_COLUMNS_STORAGE_KEY));
    } catch {
      cached = serverSnapshot;
    }
  }
  return cached;
}

function getServerSnapshot(): JournalColumn[] {
  return serverSnapshot;
}

/** The journal columns this browser shows, in drawing order. */
export function useJournalColumns() {
  const columns = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const chooseColumns = useCallback((next: JournalColumn[]) => {
    cached = normalizeJournalColumns(JSON.stringify(next));
    try {
      window.localStorage.setItem(JOURNAL_COLUMNS_STORAGE_KEY, JSON.stringify(cached));
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
    emit();
  }, []);

  return { columns, chooseColumns };
}
