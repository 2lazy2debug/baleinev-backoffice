"use client";

import { useActionState, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, PencilLine, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  bulkUpdateJournalEntriesAction,
  deleteJournalEntryAction,
  updateJournalEntryAction,
} from "@/app/(app)/journal/actions";
import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { Badge, Button, Cardlet, CardletField, CardletFields, CardletHeader, CardletList, ConfirmDelete, IconButton, Input, Panel, PanelHeader, SectionTitle, Select, TD, TH, THead, TR, Table, cn, iconButtonClasses, microLabelClasses, signedAmountClasses } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import {
  buildRunningBalances,
  draftFromEntry,
  filterEntries,
  isDraftDirty,
  sortEntries,
  visibleRowRange,
  type EntryDraft,
  type JournalColumn,
  type RowRange,
} from "@/lib/journal-grid";
import { journalColumnLabel, useJournalColumns } from "@/components/journal-columns";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

type JournalEntry = {
  id: string;
  sequenceNumber: number;
  date: Date;
  budget: { name: string } | null;
  budgetId: string | null;
  accountType: "CHARGES" | "PRODUITS";
  amount: string;
  label: string;
  referenceNumber: string | null;
  counterparty: string | null;
  linkedInvoice: { id: string; invoiceNumber: string } | null;
  moneyAccount: { name: string };
  moneyAccountId: string;
  costCenter: { code: string } | null;
  costCenterId: string | null;
  isOpeningEntry: boolean;
};

type JournalTableProps = {
  entries: JournalEntry[];
  accountBalances: Record<string, number>;
  accountOpeningBalances: Record<string, number>;
  locale: Locale;
  budgets: Array<{ id: string; name: string }>;
  moneyAccounts: Array<{ id: string; name: string }>;
  costCenters: Array<{ id: string; code: string }>;
  /** Admins only — bulk edit rewrites the whole ledger in one go. */
  canBulkEdit: boolean;
};

function typeLabel(type: string, locale: Locale) {
  const copy = dictionaries[locale].common;
  return type === "PRODUITS" ? copy.produits : copy.charges;
}

const RESIZE_MIN_WIDTH = 48;

/** Fixed widths per column; label has none, so it takes what is left. */
const COLUMN_WIDTHS: Record<JournalColumn, string | undefined> = {
  sequenceNumber: "w-16",
  date: "w-32",
  budget: "w-40",
  type: "w-32",
  amount: "w-36",
  label: undefined,
  referenceNumber: "w-32",
  counterpart: "w-40",
  account: "w-40",
  costCenter: "w-20",
  balance: "w-44",
};

const SORTABLE_COLUMNS: ReadonlySet<JournalColumn> = new Set(["sequenceNumber", "date", "budget", "amount"]);

/** Rows kept rendered above and below the viewport while the bulk grid is windowed. */
const WINDOW_OVERSCAN = 20;

type RowWindow = RowRange & { rowHeight: number };

/**
 * The slice of the bulk-edit grid worth rendering. Every row in bulk mode holds
 * eight live controls, and ~700 of them make each paint and hit test cost more
 * than a frame even when React re-renders nothing — so only the rows near the
 * viewport exist, and a spacer row above and below stands in for the rest.
 *
 * Null means "render everything": bulk mode is off, or the row height is not
 * known yet. The first bulk render is complete, which keeps the page as tall as
 * it was — the scroll position survives — and gives a real row to measure. On a
 * phone the table is `display: none`, nothing measures, and it stays complete.
 */
function useBulkRowWindow(
  enabled: boolean,
  rowCount: number,
  tbodyRef: React.RefObject<HTMLTableSectionElement | null>,
  tableRef: React.RefObject<HTMLTableElement | null>,
): RowWindow | null {
  const [rowWindow, setRowWindow] = useState<RowWindow | null>(null);
  const rowHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      rowHeightRef.current = null;
      return;
    }

    let frame = 0;
    function update() {
      frame = 0;
      const tbody = tbodyRef.current;
      if (!tbody) return;
      if (rowHeightRef.current === null) {
        // Averaged, not the first row: opening entries have no inputs and are shorter.
        const rendered = tbody.querySelectorAll(":scope > tr:not([data-row-spacer])");
        let total = 0;
        rendered.forEach((row) => {
          total += row.getBoundingClientRect().height;
        });
        if (total === 0) return;
        rowHeightRef.current = total / rendered.length;
      }
      const rowHeight = rowHeightRef.current;
      // The table's own wrapper (Table.tsx) is the scrolling box — it carries
      // `max-h-[70vh]` so `sticky top-0` has a real scrollport. Measure the
      // visible slice against its box, not the window: it is usually shorter.
      const scrollBox = tableRef.current?.parentElement ?? null;
      const boxTop = scrollBox?.getBoundingClientRect().top ?? 0;
      const viewportHeight = scrollBox?.clientHeight ?? window.innerHeight;
      const next = visibleRowRange(boxTop - tbody.getBoundingClientRect().top, viewportHeight, rowHeight, rowCount, WINDOW_OVERSCAN);
      setRowWindow((current) =>
        current && current.start === next.start && current.end === next.end && current.rowHeight === rowHeight
          ? current
          : { ...next, rowHeight },
      );
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    update();
    // Scroll events do not bubble, but they do pass window on the capture phase.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [enabled, rowCount, tbodyRef, tableRef]);

  return enabled ? rowWindow : null;
}

/** Stands in for the rows a windowed grid does not render. */
function RowSpacer({ height, colSpan }: { height: number; colSpan: number }) {
  if (height <= 0) return null;
  return (
    <tr data-row-spacer aria-hidden="true">
      {/* Inline padding: the table's density classes pad every td, and a spacer is only its height. */}
      <td colSpan={colSpan} style={{ height, padding: 0 }} />
    </tr>
  );
}

/** A drag grip on a header cell's right edge — the cell must be `relative`. */
function ColumnResizeHandle({ onResizeStart }: { onResizeStart: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  return (
    <div
      onMouseDown={onResizeStart}
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize select-none hover:bg-[var(--accent)]"
    />
  );
}

// Every value the two views show is derived once, in JournalTable. The desktop
// table and the mobile cardlets render this same array — neither recomputes a
// label, an amount or a running balance of its own.
type JournalRow = {
  entry: JournalEntry;
  dateLabel: string;
  budgetName: string;
  typeText: string;
  isProduits: boolean;
  amountLabel: string;
  counterpart: string;
  costCenterCode: string;
  balanceLabel: string;
  invoiceHref: string | null;
  invoiceNumber: string | null;
  isLocked: boolean;
  deleteDisabled: boolean;
};

type JournalTableRowProps = {
  row: JournalRow;
  /** The visible data columns, in drawing order — the actions cell always follows. */
  columns: JournalColumn[];
  draft: EntryDraft | null;
  isBulkEditing: boolean;
  onDraftChange: (entryId: string, patch: Partial<EntryDraft>) => void;
  onEditStart: (entry: JournalEntry) => void;
  onCancelEdit: () => void;
  budgets: Array<{ id: string; name: string }>;
  moneyAccounts: Array<{ id: string; name: string }>;
  costCenters: Array<{ id: string; code: string }>;
  locale: Locale;
  saveFormAction: () => void;
  isSaving: boolean;
  deleteFormAction: (formData: FormData) => void;
  isDeleting: boolean;
};

const JournalTableRow = memo(function JournalTableRow({
  row,
  columns,
  draft,
  isBulkEditing,
  onDraftChange,
  onEditStart,
  onCancelEdit,
  budgets,
  moneyAccounts,
  costCenters,
  locale,
  saveFormAction,
  isSaving,
  deleteFormAction,
  isDeleting,
}: JournalTableRowProps) {
  const copy = dictionaries[locale].journal;
  const shellCopy = dictionaries[locale].shell;
  const entry = row.entry;
  function cell(column: JournalColumn) {
    switch (column) {
      case "sequenceNumber":
        return <span className="text-[var(--muted)]">#{entry.sequenceNumber}</span>;
      case "date":
        return draft ? (
          <Input
            type="date"
            value={draft.date}
            onChange={(e) => onDraftChange(entry.id, { date: e.target.value })}
            size="sm"
          />
        ) : (
          row.dateLabel
        );
      case "budget":
        return draft ? (
          <Select
            value={draft.budgetId}
            onChange={(e) => onDraftChange(entry.id, { budgetId: e.target.value })}
            size="sm"
          >
            <option value="">-</option>
            {budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        ) : (
          row.budgetName
        );
      case "type":
        return draft ? (
          <Select
            value={draft.accountType}
            onChange={(e) => onDraftChange(entry.id, { accountType: e.target.value })}
            size="sm"
          >
            <option value="CHARGES">{dictionaries[locale].common.charges}</option>
            <option value="PRODUITS">{dictionaries[locale].common.produits}</option>
          </Select>
        ) : (
          row.typeText
        );
      case "amount":
        return draft ? (
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={draft.amount}
            onChange={(e) => onDraftChange(entry.id, { amount: e.target.value })}
            size="sm"
            className="text-right"
          />
        ) : (
          <span className={signedAmountClasses(row.isProduits)}>{row.amountLabel}</span>
        );
      case "label":
        return draft ? (
          <Input
            type="text"
            value={draft.label}
            onChange={(e) => onDraftChange(entry.id, { label: e.target.value })}
            size="sm"
          />
        ) : row.invoiceHref ? (
          <a
            href={row.invoiceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[var(--accent)] hover:underline"
            title={row.invoiceNumber ?? undefined}
          >
            {row.invoiceNumber ?? entry.label}
          </a>
        ) : (
          <span className="truncate">{entry.label}</span>
        );
      case "referenceNumber":
        return entry.referenceNumber ?? "-";
      case "counterpart":
        return draft ? (
          <Input
            type="text"
            value={draft.counterparty}
            onChange={(e) => onDraftChange(entry.id, { counterparty: e.target.value })}
            size="sm"
          />
        ) : (
          row.counterpart
        );
      case "account":
        return draft ? (
          <Select
            value={draft.moneyAccountId}
            onChange={(e) => onDraftChange(entry.id, { moneyAccountId: e.target.value })}
            size="sm"
          >
            {moneyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        ) : (
          entry.moneyAccount.name
        );
      case "costCenter":
        return draft ? (
          <Select
            value={draft.costCenterId}
            onChange={(e) => onDraftChange(entry.id, { costCenterId: e.target.value })}
            size="sm"
          >
            <option value="">-</option>
            {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code}</option>)}
          </Select>
        ) : (
          row.costCenterCode
        );
      case "balance":
        return row.balanceLabel;
    }
  }

  return (
    <TR className={draft ? "bg-[var(--panel-strong)]" : undefined}>
      {columns.map((column) => (
        <TD key={column} className={column === "balance" ? "font-semibold" : undefined}>
          {cell(column)}
        </TD>
      ))}
      <TD>
        {/* Bulk mode owns saving: a row shows no save, cancel or delete of
            its own until the header's Save all or Cancel ends the mode. A
            locked row still says so — that is why it has no draft. */}
        {row.isLocked ? (
          <span className="text-xs text-[var(--muted)]">{copy.locked}</span>
        ) : isBulkEditing ? null : draft ? (
          <div className="flex items-center gap-2">
            <IconButton
              onClick={() => saveFormAction()}
              disabled={isSaving}
              tone="save"
              label={shellCopy.save}
            >
              <Check />
            </IconButton>
            <IconButton onClick={onCancelEdit} tone="neutral" label={shellCopy.cancel}>
              <X />
            </IconButton>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <IconButton onClick={() => onEditStart(entry)} tone="accent" label={copy.edit}>
              <Pencil />
            </IconButton>
            <form id={`delete-journal-entry-${entry.id}`} action={deleteFormAction}>
              <input type="hidden" name="journalEntryId" value={entry.id} />
            </form>
            <ConfirmDelete
              form={`delete-journal-entry-${entry.id}`}
              label={row.deleteDisabled ? copy.locked : copy.deleteEntry}
              subject={entry.label}
              message={dictionaries[locale].common.cannotBeUndone}
              cancelLabel={shellCopy.cancel}
              disabled={row.deleteDisabled || isDeleting}
            />
          </div>
        )}
      </TD>
    </TR>
  );
});

type JournalCardletProps = {
  row: JournalRow;
  columns: JournalColumn[];
  draft: EntryDraft | null;
  isBulkEditing: boolean;
  onDraftChange: (entryId: string, patch: Partial<EntryDraft>) => void;
  budgets: Array<{ id: string; name: string }>;
  moneyAccounts: Array<{ id: string; name: string }>;
  costCenters: Array<{ id: string; code: string }>;
  locale: Locale;
  deleteFormAction: (formData: FormData) => void;
  isDeleting: boolean;
};

const JournalCardlet = memo(function JournalCardlet({
  row,
  columns,
  draft,
  isBulkEditing,
  onDraftChange,
  budgets,
  moneyAccounts,
  costCenters,
  locale,
  deleteFormAction,
  isDeleting,
}: JournalCardletProps) {
  const copy = dictionaries[locale].journal;
  return (
    <Cardlet>
      <CardletHeader
        title={
          <>
            <p className="text-3xs font-normal text-[var(--muted)]">
              {draft ? `#${row.entry.sequenceNumber}` : `#${row.entry.sequenceNumber} · ${row.dateLabel}`}
            </p>
            {draft ? (
              <Input
                type="text"
                value={draft.label}
                onChange={(e) => onDraftChange(row.entry.id, { label: e.target.value })}
                size="sm"
                className="mt-1"
              />
            ) : row.invoiceHref ? (
              <a
                href={row.invoiceHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 block truncate text-[var(--accent)]"
                title={row.invoiceNumber ?? undefined}
              >
                {row.entry.label}
              </a>
            ) : (
              <p className="mt-0.5 truncate">{row.entry.label}</p>
            )}
          </>
        }
        action={
          draft ? null : (
            <div className="shrink-0 text-right">
              <Badge tone={row.isProduits ? "success" : "neutral"}>{row.typeText}</Badge>
              <p className={cn("mt-1 text-sm font-semibold", signedAmountClasses(row.isProduits))}>
                {row.amountLabel}
              </p>
            </div>
          )
        }
      />

      {/* The same eight fields as a table row, stacked — a phone in bulk mode
          edits the entry it is looking at, it does not leave for a form page. */}
      {draft ? (
        <CardletFields>
          <CardletField label={copy.date}>
            <Input
              type="date"
              value={draft.date}
              onChange={(e) => onDraftChange(row.entry.id, { date: e.target.value })}
              size="sm"
            />
          </CardletField>
          <CardletField label={copy.amount}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={draft.amount}
              onChange={(e) => onDraftChange(row.entry.id, { amount: e.target.value })}
              size="sm"
              className="text-right"
            />
          </CardletField>
          <CardletField label={copy.type} className="col-span-2">
            <Select
              value={draft.accountType}
              onChange={(e) => onDraftChange(row.entry.id, { accountType: e.target.value })}
              size="sm"
            >
              <option value="CHARGES">{dictionaries[locale].common.charges}</option>
              <option value="PRODUITS">{dictionaries[locale].common.produits}</option>
            </Select>
          </CardletField>
          <CardletField label={copy.budget} className="col-span-2">
            <Select
              value={draft.budgetId}
              onChange={(e) => onDraftChange(row.entry.id, { budgetId: e.target.value })}
              size="sm"
            >
              <option value="">-</option>
              {budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </CardletField>
          <CardletField label={copy.account} className="col-span-2">
            <Select
              value={draft.moneyAccountId}
              onChange={(e) => onDraftChange(row.entry.id, { moneyAccountId: e.target.value })}
              size="sm"
            >
              {moneyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </CardletField>
          <CardletField label={copy.costCenter} className="col-span-2">
            <Select
              value={draft.costCenterId}
              onChange={(e) => onDraftChange(row.entry.id, { costCenterId: e.target.value })}
              size="sm"
            >
              <option value="">-</option>
              {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code}</option>)}
            </Select>
          </CardletField>
          <CardletField label={copy.counterpart} className="col-span-2">
            <Input
              type="text"
              value={draft.counterparty}
              onChange={(e) => onDraftChange(row.entry.id, { counterparty: e.target.value })}
              size="sm"
            />
          </CardletField>
        </CardletFields>
      ) : (
        <CardletFields>
          {/* The table's column choice applies here too; the header line (#,
              date, label, type, amount) is what identifies a card and stays. */}
          {columns.includes("budget") ? <CardletField label={copy.budget}>{row.budgetName}</CardletField> : null}
          {columns.includes("account") ? <CardletField label={copy.account}>{row.entry.moneyAccount.name}</CardletField> : null}
          {columns.includes("costCenter") ? <CardletField label={copy.costCenter}>{row.costCenterCode}</CardletField> : null}
          {columns.includes("counterpart") ? <CardletField label={copy.counterpart}>{row.counterpart}</CardletField> : null}
          {columns.includes("referenceNumber") ? (
            <CardletField label={copy.reference}>{row.entry.referenceNumber ?? "-"}</CardletField>
          ) : null}
        </CardletFields>
      )}

      {draft || !columns.includes("balance") ? null : (
        <p className="text-xs text-[var(--muted)]">
          {copy.balance}: <span className="font-semibold text-[var(--ink)]">{row.balanceLabel}</span>
        </p>
      )}

      {row.isLocked ? (
        <p className={microLabelClasses}>{copy.locked}</p>
      ) : isBulkEditing ? null : (
        <div className="flex gap-2">
          {/* Editing one entry on a phone is the existing full-page form, not the
              table's inline row editor — seven controls do not fit inside a card. */}
          <Link
            href={`/journal/${row.entry.id}`}
            title={copy.edit}
            aria-label={copy.edit}
            className={iconButtonClasses("accent")}
          >
            <Pencil />
          </Link>
          <form id={`delete-journal-entry-card-${row.entry.id}`} action={deleteFormAction}>
            <input type="hidden" name="journalEntryId" value={row.entry.id} />
          </form>
          <ConfirmDelete
            form={`delete-journal-entry-card-${row.entry.id}`}
            label={row.deleteDisabled ? copy.locked : copy.deleteEntry}
            subject={row.entry.label}
            message={dictionaries[locale].common.cannotBeUndone}
            cancelLabel={dictionaries[locale].shell.cancel}
            disabled={row.deleteDisabled || isDeleting}
          />
        </div>
      )}
    </Cardlet>
  );
});

export function JournalTable({ entries, accountBalances, accountOpeningBalances, locale, budgets, moneyAccounts, costCenters, canBulkEdit }: JournalTableProps) {
  const copy = dictionaries[locale].journal;
  const shellCopy = dictionaries[locale].shell;

  const [filters, setFilters] = useState<Record<string, string>>({
    sequenceNumber: "",
    date: "",
    budget: "",
    type: "",
    amount: "",
    label: "",
    referenceNumber: "",
    counterpart: "",
    account: "",
    costCenter: "",
  });


  const [sortBy, setSortBy] = useState<{ column: string; direction: "asc" | "desc" } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EntryDraft | null>(null);
  // Bulk edit is one draft per editable entry, or null when the mode is off.
  // Every row is editable at once and nothing saves until the header says so,
  // which is why the per-row save, cancel and delete controls disappear while
  // it is on — two ways to write the same row is one too many.
  const [bulkDrafts, setBulkDrafts] = useState<Record<string, EntryDraft> | null>(null);
  const isBulkEditing = bulkDrafts !== null;
  const router = useRouter();
  const tableRef = useRef<HTMLTableElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

  useEffect(() => {
    function onSidebarToggled(e: Event) {
      const extra: number = Number((e as CustomEvent<{ extra?: number }>).detail?.extra ?? 0);
      const table = tableRef.current;
      if (!table) return;

      const colgroup = table.querySelectorAll("colgroup > col");
      if (!colgroup || colgroup.length === 0) return;

      // flexible columns are those without Tailwind w- classes (fixed widths),
      // minus any column the person has since dragged to a width of their own —
      // a manual resize is a deliberate choice and outranks this redistribution.
      const flexibleIndexes: number[] = [];
      colgroup.forEach((c, idx) => {
        const cls = c.getAttribute("class") || "";
        if (!/\bw-\d+/.test(cls) && c.getAttribute("data-resized") !== "true") flexibleIndexes.push(idx);
      });

      if (flexibleIndexes.length === 0) return;

      if (extra === 0) {
        // clear inline widths
        colgroup.forEach((c) => c.removeAttribute("style"));
        return;
      }

      // measure header cell widths to compute current sizes
      const headerRow = table.querySelector("thead tr");
      if (!headerRow) return;
      const ths = Array.from(headerRow.querySelectorAll("th"));

      const addPer = Math.floor(extra / flexibleIndexes.length);

      flexibleIndexes.forEach((colIdx) => {
        const th = ths[colIdx];
        if (!th) return;
        const current = Math.round(th.getBoundingClientRect().width);
        const newW = current + addPer;
        const col = colgroup[colIdx] as HTMLElement;
        if (col) col.style.width = `${newW}px`;
      });
    }

    window.addEventListener("sidebar:toggled", onSidebarToggled);
    return () => window.removeEventListener("sidebar:toggled", onSidebarToggled);
  }, []);

  // Build deterministic running balances from opening balances and journal sequence.
  const runningBalanceByEntryId = useMemo(
    () => buildRunningBalances(entries, accountOpeningBalances),
    [entries, accountOpeningBalances],
  );

  const { columns } = useJournalColumns();

  // A hidden column's filter would narrow the list with no visible input to
  // explain or clear it, so only the shown columns filter.
  const sortedEntries = useMemo(() => {
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([key]) => (columns as string[]).includes(key)),
    );
    return sortEntries(filterEntries(entries, activeFilters), sortBy);
  }, [entries, filters, sortBy, columns]);

  const handleSort = (column: string) => {
    if (sortBy?.column === column) {
      setSortBy({
        column,
        direction: sortBy.direction === "asc" ? "desc" : "asc",
      });
    } else {
      setSortBy({ column, direction: "asc" });
    }
  };

  const handleFilterChange = (column: string, value: string) => {
    setFilters({ ...filters, [column]: value });
  };

  function handleResizeStart(colIndex: number) {
    return (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const table = tableRef.current;
      if (!table) return;
      const col = table.querySelectorAll("colgroup > col")[colIndex] as HTMLElement | undefined;
      const th = table.querySelectorAll("thead tr")[0]?.querySelectorAll("th")[colIndex] as HTMLElement | undefined;
      if (!col || !th) return;

      const startX = e.clientX;
      const startWidth = th.getBoundingClientRect().width;
      document.body.classList.add("cursor-col-resize", "select-none");

      function onMouseMove(ev: MouseEvent) {
        const width = Math.max(RESIZE_MIN_WIDTH, Math.round(startWidth + (ev.clientX - startX)));
        col!.style.width = `${width}px`;
        col!.setAttribute("data-resized", "true");
      }
      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.classList.remove("cursor-col-resize", "select-none");
      }
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };
  }

  const handleEditStart = useCallback((entry: JournalEntry) => {
    setEditingId(entry.id);
    setEditDraft(draftFromEntry(entry));
  }, []);

  const cancelInlineEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft(null);
  }, []);

  async function handleSaveEntry(_prevState: ActionState): Promise<ActionState> {
    if (!editingId || !editDraft) {
      return { error: null };
    }

    const formData = new FormData();
    formData.set("journalEntryId", editingId);
    formData.set("budgetId", editDraft.budgetId);
    formData.set("moneyAccountId", editDraft.moneyAccountId);
    formData.set("accountType", editDraft.accountType);
    formData.set("date", editDraft.date);
    formData.set("amount", editDraft.amount);
    formData.set("label", editDraft.label);
    formData.set("counterparty", editDraft.counterparty);
    formData.set("costCenterId", editDraft.costCenterId);
    const result = await updateJournalEntryAction(_prevState, formData);

    if (result.error) {
      return result;
    }

    setEditingId(null);
    setEditDraft(null);
    router.refresh();
    return result;
  }
  const [saveState, saveFormAction, isSaving] = useActionState(handleSaveEntry, initialActionState);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteJournalEntryAction, initialActionState);
  const isReadOnly = useEditionReadOnly();

  // Opening entries stay locked in bulk mode too — the server refuses them, so
  // the grid never offers them.
  const bulkEditableEntries = useMemo(
    () => entries.filter((entry) => !entry.isOpeningEntry),
    [entries],
  );
  const baselineById = useMemo(
    () => Object.fromEntries(bulkEditableEntries.map((entry) => [entry.id, draftFromEntry(entry)])),
    [bulkEditableEntries],
  );
  const changedEntries = useMemo(
    () =>
      bulkDrafts
        ? bulkEditableEntries.filter(
            (entry) => bulkDrafts[entry.id] && isDraftDirty(baselineById[entry.id], bulkDrafts[entry.id]),
          )
        : [],
    [bulkDrafts, bulkEditableEntries, baselineById],
  );

  function startBulkEdit() {
    // A row half-edited inline is discarded rather than merged: the grid is
    // seeded from what is stored, so what you see is what will be saved.
    setEditingId(null);
    setEditDraft(null);
    setBulkDrafts(Object.fromEntries(bulkEditableEntries.map((entry) => [entry.id, { ...baselineById[entry.id] }])));
  }

  function cancelBulkEdit() {
    setBulkDrafts(null);
  }

  async function handleSaveAll(_prevState: ActionState): Promise<ActionState> {
    if (changedEntries.length === 0) {
      return { error: null };
    }

    const formData = new FormData();
    formData.set(
      "entries",
      JSON.stringify(
        changedEntries.map((entry) => ({ journalEntryId: entry.id, ...bulkDrafts![entry.id] })),
      ),
    );
    const result = await bulkUpdateJournalEntriesAction(_prevState, formData);

    if (result.error) {
      return result;
    }

    setBulkDrafts(null);
    router.refresh();
    return result;
  }
  const [bulkState, bulkSaveFormAction, isBulkSaving] = useActionState(handleSaveAll, initialActionState);

  const updateBulkDraft = useCallback((entryId: string, patch: Partial<EntryDraft>) => {
    setBulkDrafts((current) => (current ? { ...current, [entryId]: { ...current[entryId], ...patch } } : current));
  }, []);

  const updateEditDraft = useCallback((_entryId: string, patch: Partial<EntryDraft>) => {
    setEditDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const onDraftChange = isBulkEditing ? updateBulkDraft : updateEditDraft;

  const { uniqueBudgets, uniqueAccounts, uniqueCostCenters } = useMemo(
    () => ({
      uniqueBudgets: [...new Set(entries.map((e) => e.budget?.name).filter(Boolean))],
      uniqueAccounts: [...new Set(entries.map((e) => e.moneyAccount.name))],
      uniqueCostCenters: [...new Set(entries.map((e) => e.costCenter?.code).filter(Boolean))],
    }),
    [entries],
  );

  const rows: JournalRow[] = useMemo(
    () =>
      sortedEntries.map((entry) => ({
        entry,
        dateLabel: entry.date.toISOString().slice(0, 10),
        budgetName: entry.budget?.name ?? "-",
        typeText: typeLabel(entry.accountType, locale),
        isProduits: entry.accountType === "PRODUITS",
        amountLabel: formatCurrency(Number(entry.amount.toString())),
        counterpart: entry.counterparty ?? "-",
        costCenterCode: entry.costCenter?.code ?? "-",
        balanceLabel: formatCurrency(
          runningBalanceByEntryId[entry.id] ?? accountBalances[entry.moneyAccount.name] ?? 0,
        ),
        invoiceHref: entry.linkedInvoice ? `/api/invoices/${entry.linkedInvoice.id}/pdf` : null,
        invoiceNumber: entry.linkedInvoice?.invoiceNumber ?? null,
        // An opening entry, or any entry in a closed edition, has no actions at all;
        // an invoice-linked entry can still be edited but never deleted.
        isLocked: entry.isOpeningEntry || isReadOnly,
        deleteDisabled: Boolean(entry.linkedInvoice),
      })),
    [sortedEntries, runningBalanceByEntryId, accountBalances, locale, isReadOnly],
  );

  // The row's live draft, whichever mode put it there — null when it is read-only.
  const draftFor = (id: string) => (isBulkEditing ? bulkDrafts[id] : editingId === id ? editDraft : null) ?? null;

  // Only the desktop table is windowed, and only in bulk mode: read mode has no
  // controls to weigh it down, and the cardlets render for a phone, where the
  // table is hidden. Drafts live in state, not in rows, so a row scrolled out
  // of the window keeps its edits.
  const rowWindow = useBulkRowWindow(isBulkEditing, rows.length, tbodyRef, tableRef);
  const tableRows = rowWindow ? rows.slice(rowWindow.start, rowWindow.end) : rows;

  function headerLabel(column: JournalColumn) {
    if (column === "sequenceNumber") return "#";
    if (column === "costCenter") return copy.costCenterShort;
    return journalColumnLabel(column, locale);
  }

  function filterSelect(column: JournalColumn, options: Array<{ value: string; label: string }>) {
    return (
      <Select value={filters[column]} onChange={(e) => handleFilterChange(column, e.target.value)} size="sm">
        <option value="">{copy.all}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }

  function filterControl(column: JournalColumn) {
    switch (column) {
      case "balance":
        return null;
      case "budget":
        return filterSelect(column, uniqueBudgets.map((name) => ({ value: name!, label: name! })));
      case "type":
        return filterSelect(column, [
          { value: "CHARGES", label: dictionaries[locale].common.charges },
          { value: "PRODUITS", label: dictionaries[locale].common.produits },
        ]);
      case "account":
        return filterSelect(column, uniqueAccounts.map((name) => ({ value: name, label: name })));
      case "costCenter":
        return filterSelect(column, uniqueCostCenters.map((code) => ({ value: code!, label: code! })));
      default:
        return (
          <Input
            type="text"
            placeholder={copy.filter}
            value={filters[column]}
            onChange={(e) => handleFilterChange(column, e.target.value)}
            size="sm"
          />
        );
    }
  }

  return (
    <Panel flushOnMobile as="div" className="flex h-full flex-col">
      <PanelHeader flushOnMobile className="shrink-0 flex-wrap">
        <div className="min-w-0">
          <SectionTitle>{copy.entries}</SectionTitle>
          <p className="text-xs text-[var(--muted)]">
            {isBulkEditing ? copy.bulkEditActive : <>{copy.showing} {sortedEntries.length} {copy.of} {entries.length}</>}
          </p>
        </div>
        {canBulkEdit && !isReadOnly ? (
          <div className="flex shrink-0 items-center gap-2">
            {isBulkEditing ? (
              <>
                <Button size="sm" variant="ghost" onClick={cancelBulkEdit} disabled={isBulkSaving}>
                  {shellCopy.cancel}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Check />}
                  onClick={() => bulkSaveFormAction()}
                  disabled={isBulkSaving || changedEntries.length === 0}
                >
                  {copy.saveAll}{changedEntries.length > 0 ? ` (${changedEntries.length})` : ""}
                </Button>
              </>
            ) : (
              <Button size="sm" icon={<PencilLine />} onClick={startBulkEdit} disabled={bulkEditableEntries.length === 0}>
                {copy.bulkEdit}
              </Button>
            )}
          </div>
        ) : null}
      </PanelHeader>
      {(saveState.error || deleteState.error || bulkState.error) ? (
        <div className="border-b border-[var(--line)] px-3 py-2.5 sm:px-5 sm:py-4 shrink-0">
          <FormError message={saveState.error ?? deleteState.error ?? bulkState.error} />
        </div>
      ) : null}

      {/* Bounded and scrollable in its own right: `sticky top-0` on THead only
          sticks to an ancestor that actually scrolls, and the page itself does
          not — it grows to fit the table. `max-h-[70vh]` matches the same
          pattern in calendar/budget's client.tsx. */}
      <Table ref={tableRef} frame={false} desktopOnly frameClassName="flex-1 min-h-0 max-h-[70vh]" className="table-fixed">
          <colgroup>
            {columns.map((column) => (
              <col key={column} className={COLUMN_WIDTHS[column]} />
            ))}
            {/* Empty for every row while bulk edit is on — save/cancel moved to the
                header, so the column has nothing left to hold but a rare "locked". */}
            <col className={isBulkEditing ? "w-16" : "w-24"} />
          </colgroup>
          <THead sticky>
            <TR>
              {columns.map((column, index) => (
                <TH
                  key={column}
                  className={cn("relative", SORTABLE_COLUMNS.has(column) && "cursor-pointer hover:bg-[var(--line)]")}
                  onClick={SORTABLE_COLUMNS.has(column) ? () => handleSort(column) : undefined}
                >
                  {headerLabel(column)}
                  <ColumnResizeHandle onResizeStart={handleResizeStart(index)} />
                </TH>
              ))}
              <TH className="relative">
                {copy.actions}
                <ColumnResizeHandle onResizeStart={handleResizeStart(columns.length)} />
              </TH>
            </TR>
            <TR className="bg-[var(--panel)] normal-case">
              {columns.map((column) => (
                <TH key={column}>{filterControl(column)}</TH>
              ))}
              <TH></TH>
            </TR>
          </THead>
          <tbody ref={tbodyRef}>
            {rowWindow ? <RowSpacer height={rowWindow.start * rowWindow.rowHeight} colSpan={columns.length + 1} /> : null}
            {tableRows.map((row) => (
              <JournalTableRow
                key={row.entry.id}
                row={row}
                columns={columns}
                draft={draftFor(row.entry.id)}
                isBulkEditing={isBulkEditing}
                onDraftChange={onDraftChange}
                onEditStart={handleEditStart}
                onCancelEdit={cancelInlineEdit}
                budgets={budgets}
                moneyAccounts={moneyAccounts}
                costCenters={costCenters}
                locale={locale}
                saveFormAction={saveFormAction}
                isSaving={isSaving}
                deleteFormAction={deleteFormAction}
                isDeleting={isDeleting}
              />
            ))}
            {rowWindow ? (
              <RowSpacer height={Math.max(0, rows.length - rowWindow.end) * rowWindow.rowHeight} colSpan={columns.length + 1} />
            ) : null}
          </tbody>
        </Table>

      {/* Below `sm` the wide table is unreadable, so the same rows render as
          cards. Filtering and sorting live in the table header and stay desktop-only —
          a phone gets the entries in journal order. */}
      <CardletList>
        {rows.map((row) => (
          <JournalCardlet
            key={row.entry.id}
            row={row}
            columns={columns}
            draft={draftFor(row.entry.id)}
            isBulkEditing={isBulkEditing}
            onDraftChange={onDraftChange}
            budgets={budgets}
            moneyAccounts={moneyAccounts}
            costCenters={costCenters}
            locale={locale}
            deleteFormAction={deleteFormAction}
            isDeleting={isDeleting}
          />
        ))}
      </CardletList>
    </Panel>
  );
}
