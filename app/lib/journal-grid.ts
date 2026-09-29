/** The eight fields the journal is edited by, inline or in bulk. */
export type EntryDraft = {
  date: string;
  budgetId: string;
  accountType: string;
  amount: string;
  label: string;
  counterparty: string;
  moneyAccountId: string;
  costCenterId: string;
};

type GridEntry = {
  id: string;
  sequenceNumber: number;
  date: Date;
  budget: { name: string } | null;
  budgetId: string | null;
  accountType: "CHARGES" | "PRODUITS";
  amount: string;
  label: string;
  counterparty: string | null;
  moneyAccount: { name: string };
  moneyAccountId: string;
  costCenter: { code: string } | null;
  costCenterId: string | null;
};

/** An entry as the editor sees it — the baseline both edit modes start from. */
export function draftFromEntry(entry: GridEntry): EntryDraft {
  return {
    date: entry.date.toISOString().slice(0, 10),
    budgetId: entry.budgetId ?? "",
    accountType: entry.accountType,
    amount: Number(entry.amount).toFixed(2),
    label: entry.label,
    counterparty: entry.counterparty ?? "",
    moneyAccountId: entry.moneyAccountId,
    costCenterId: entry.costCenterId ?? "",
  };
}

export function isDraftDirty(baseline: EntryDraft, draft: EntryDraft): boolean {
  return (Object.keys(baseline) as Array<keyof EntryDraft>).some((field) => baseline[field] !== draft[field]);
}

export function buildRunningBalances(
  entries: GridEntry[],
  openingBalances: Record<string, number>,
): Record<string, number> {
  const runningBalanceByEntryId: Record<string, number> = {};
  const accountRunningTotals: Record<string, number> = { ...openingBalances };
  const entriesBySequence = [...entries].sort((a, b) => {
    if (a.sequenceNumber !== b.sequenceNumber) {
      return a.sequenceNumber - b.sequenceNumber;
    }
    return a.id.localeCompare(b.id);
  });

  for (const entry of entriesBySequence) {
    const previous = accountRunningTotals[entry.moneyAccountId] ?? 0;
    const amount = Number(entry.amount);
    const signedAmount = entry.accountType === "PRODUITS" ? amount : -amount;
    const next = previous + signedAmount;
    accountRunningTotals[entry.moneyAccountId] = next;
    runningBalanceByEntryId[entry.id] = next;
  }

  return runningBalanceByEntryId;
}

export function filterEntries<T extends GridEntry>(entries: T[], filters: Record<string, string>): T[] {
  return entries.filter((entry) => {
    if (filters.sequenceNumber && !entry.sequenceNumber.toString().includes(filters.sequenceNumber)) {
      return false;
    }
    if (filters.date && !entry.date.toISOString().slice(0, 10).includes(filters.date)) {
      return false;
    }
    if (filters.budget && entry.budget?.name && !entry.budget.name.toLowerCase().includes(filters.budget.toLowerCase())) {
      return false;
    }
    if (filters.type && !entry.accountType.toLowerCase().includes(filters.type.toLowerCase())) {
      return false;
    }
    if (filters.amount && !Number(entry.amount).toFixed(2).includes(filters.amount)) {
      return false;
    }
    if (filters.label && !entry.label.toLowerCase().includes(filters.label.toLowerCase())) {
      return false;
    }
    if (filters.counterpart && !String(entry.counterparty ?? "").toLowerCase().includes(filters.counterpart.toLowerCase())) {
      return false;
    }
    if (filters.account && !entry.moneyAccount.name.toLowerCase().includes(filters.account.toLowerCase())) {
      return false;
    }
    if (filters.costCenter && entry.costCenter && !entry.costCenter.code.toLowerCase().includes(filters.costCenter.toLowerCase())) {
      return false;
    }
    return true;
  });
}

export function sortEntries<T extends GridEntry>(
  entries: T[],
  sortBy: { column: string; direction: "asc" | "desc" } | null,
): T[] {
  return [...entries].sort((a, b) => {
    if (!sortBy) return 0;

    let aVal: string | number;
    let bVal: string | number;

    switch (sortBy.column) {
      case "sequenceNumber":
        aVal = a.sequenceNumber;
        bVal = b.sequenceNumber;
        break;
      case "date":
        aVal = a.date.getTime();
        bVal = b.date.getTime();
        break;
      case "budget":
        aVal = a.budget?.name ?? "";
        bVal = b.budget?.name ?? "";
        break;
      case "amount":
        aVal = Number(a.amount);
        bVal = Number(b.amount);
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortBy.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sortBy.direction === "asc" ? 1 : -1;
    return 0;
  });
}

export type RowRange = { start: number; end: number };

/**
 * Which rows of a list of `rowCount` equal-height rows to render, given how far
 * the list's top edge sits above the viewport (`offset`, negative while it is
 * still below the viewport's top). `end` is exclusive; `overscan` rows are kept
 * on each side so Tab and small scrolls never land on an unrendered row.
 */
export function visibleRowRange(
  offset: number,
  viewportHeight: number,
  rowHeight: number,
  rowCount: number,
  overscan: number,
): RowRange {
  const first = Math.floor(Math.max(0, offset) / rowHeight);
  const last = Math.ceil(Math.max(0, offset + viewportHeight) / rowHeight);
  return {
    start: Math.min(rowCount, Math.max(0, first - overscan)),
    end: Math.min(rowCount, last + overscan),
  };
}
