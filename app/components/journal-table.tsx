"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, PencilLine, Trash2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  bulkUpdateJournalEntriesAction,
  deleteJournalEntryAction,
  updateJournalEntryAction,
} from "@/app/(app)/journal/actions";
import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import {
  Badge,
  Button,
  Cardlet,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  IconButton,
  Input,
  Panel,
  PanelHeader,
  SectionTitle,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table,
  cn,
  iconButtonClasses,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

type JournalEntry = {
  id: string;
  sequenceNumber: number;
  date: Date;
  department: { name: string } | null;
  departmentId: string | null;
  accountType: "CHARGES" | "PRODUITS";
  amount: string;
  label: string;
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
  departments: Array<{ id: string; name: string }>;
  moneyAccounts: Array<{ id: string; name: string }>;
  costCenters: Array<{ id: string; code: string }>;
  /** Admins only — bulk edit rewrites the whole ledger in one go. */
  canBulkEdit: boolean;
};

/** The seven fields the journal is edited by, inline or in bulk. */
type EntryDraft = {
  date: string;
  departmentId: string;
  accountType: string;
  amount: string;
  label: string;
  moneyAccountId: string;
  costCenterId: string;
};

function typeLabel(type: string, locale: Locale) {
  const copy = dictionaries[locale].common;
  return type === "PRODUITS" ? copy.produits : copy.charges;
}

/** An entry as the editor sees it — the baseline both edit modes start from. */
function draftFromEntry(entry: JournalEntry): EntryDraft {
  return {
    date: entry.date.toISOString().slice(0, 10),
    departmentId: entry.departmentId ?? "",
    accountType: entry.accountType,
    amount: Number(entry.amount).toFixed(2),
    label: entry.label,
    moneyAccountId: entry.moneyAccountId,
    costCenterId: entry.costCenterId ?? "",
  };
}

function isDirty(entry: JournalEntry, draft: EntryDraft) {
  const stored = draftFromEntry(entry);
  return (Object.keys(stored) as Array<keyof EntryDraft>).some((field) => stored[field] !== draft[field]);
}

export function JournalTable({ entries, accountBalances, accountOpeningBalances, locale, departments, moneyAccounts, costCenters, canBulkEdit }: JournalTableProps) {
  const copy = dictionaries[locale].journal;
  const shellCopy = dictionaries[locale].shell;

  const [filters, setFilters] = useState<Record<string, string>>({
    sequenceNumber: "",
    date: "",
    department: "",
    type: "",
    amount: "",
    label: "",
    beneficiary: "",
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

  useEffect(() => {
    function onSidebarToggled(e: any) {
      const extra: number = Number(e?.detail?.extra ?? 0);
      const table = tableRef.current;
      if (!table) return;

      const colgroup = table.querySelectorAll("colgroup > col");
      if (!colgroup || colgroup.length === 0) return;

      // flexible columns are those without Tailwind w- classes (fixed widths)
      const flexibleIndexes: number[] = [];
      colgroup.forEach((c, idx) => {
        const cls = c.getAttribute("class") || "";
        if (!/\bw-\d+/.test(cls)) flexibleIndexes.push(idx);
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

    window.addEventListener("sidebar:toggled", onSidebarToggled as any);
    return () => window.removeEventListener("sidebar:toggled", onSidebarToggled as any);
  }, []);

  // Build deterministic running balances from opening balances and journal sequence.
  const runningBalanceByEntryId: Record<string, number> = {};
  const accountRunningTotals: Record<string, number> = { ...accountOpeningBalances };
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

  // Apply filters
  const filteredEntries = entries.filter((entry) => {
    if (filters.sequenceNumber && !entry.sequenceNumber.toString().includes(filters.sequenceNumber)) {
      return false;
    }
    if (filters.date && !entry.date.toISOString().slice(0, 10).includes(filters.date)) {
      return false;
    }
    if (filters.department && entry.department?.name && !entry.department.name.toLowerCase().includes(filters.department.toLowerCase())) {
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
    if (filters.beneficiary && !String(entry.counterparty ?? "").toLowerCase().includes(filters.beneficiary.toLowerCase())) {
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

  // Apply sorting
  const sortedEntries = [...filteredEntries].sort((a, b) => {
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
      case "department":
        aVal = a.department?.name ?? "";
        bVal = b.department?.name ?? "";
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

  function handleEditStart(entry: JournalEntry) {
    setEditingId(entry.id);
    setEditDraft(draftFromEntry(entry));
  }

  async function handleSaveEntry(_prevState: ActionState): Promise<ActionState> {
    if (!editingId || !editDraft) {
      return { error: null };
    }

    const formData = new FormData();
    formData.set("journalEntryId", editingId);
    formData.set("departmentId", editDraft.departmentId);
    formData.set("moneyAccountId", editDraft.moneyAccountId);
    formData.set("accountType", editDraft.accountType);
    formData.set("date", editDraft.date);
    formData.set("amount", editDraft.amount);
    formData.set("label", editDraft.label);
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
  const bulkEditableEntries = entries.filter((entry) => !entry.isOpeningEntry);
  const changedEntries = bulkDrafts
    ? bulkEditableEntries.filter((entry) => bulkDrafts[entry.id] && isDirty(entry, bulkDrafts[entry.id]))
    : [];

  function startBulkEdit() {
    // A row half-edited inline is discarded rather than merged: the grid is
    // seeded from what is stored, so what you see is what will be saved.
    setEditingId(null);
    setEditDraft(null);
    setBulkDrafts(Object.fromEntries(bulkEditableEntries.map((entry) => [entry.id, draftFromEntry(entry)])));
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

  function updateDraft(entryId: string, patch: Partial<EntryDraft>) {
    if (isBulkEditing) {
      setBulkDrafts((current) => (current ? { ...current, [entryId]: { ...current[entryId], ...patch } } : current));
      return;
    }
    setEditDraft((current) => (current ? { ...current, ...patch } : current));
  }

  const uniqueDepartments = [...new Set(entries.map((e) => e.department?.name).filter(Boolean))];
  const uniqueAccounts = [...new Set(entries.map((e) => e.moneyAccount.name))];
  const uniqueCostCenters = [...new Set(entries.map((e) => e.costCenter?.code).filter(Boolean))];

  // Every value the two views show is derived once, here. The desktop table and the
  // mobile cardlets render this same array — neither recomputes a label, an amount or
  // a running balance of its own.
  const rows = sortedEntries.map((entry) => ({
    entry,
    dateLabel: entry.date.toISOString().slice(0, 10),
    departmentName: entry.department?.name ?? "-",
    typeText: typeLabel(entry.accountType, locale),
    isProduits: entry.accountType === "PRODUITS",
    amountLabel: formatCurrency(Number(entry.amount.toString())),
    beneficiary: entry.counterparty ?? "-",
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
    // The row's live draft, whichever mode put it there — null when it is read-only.
    draft: (isBulkEditing ? bulkDrafts[entry.id] : editingId === entry.id ? editDraft : null) ?? null,
  }));

  return (
    <Panel as="div" className="flex h-full flex-col bg-[var(--panel)]">
      <PanelHeader className="shrink-0 flex-wrap">
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
        <div className="border-b border-[var(--line)] px-4 py-2 shrink-0">
          <FormError message={saveState.error ?? deleteState.error ?? bulkState.error} />
        </div>
      ) : null}

      <Table ref={tableRef} frame={false} desktopOnly frameClassName="flex-1" className="table-fixed">
          <colgroup>
            <col className="w-32" />
            <col className="w-40" />
            <col className="w-32" />
            <col className="w-36" />
            <col />
            <col className="w-40" />
            <col className="w-40" />
            <col className="w-20" />
            <col className="w-44" />
            <col className="w-24" />
          </colgroup>
          <THead className="sticky top-0">
            <TR>
              <TH className="cursor-pointer hover:bg-[var(--line)]" onClick={() => handleSort("date")}>
                {copy.date}
              </TH>
              <TH className="cursor-pointer hover:bg-[var(--line)]" onClick={() => handleSort("department")}>
                {copy.department}
              </TH>
              <TH>{copy.type}</TH>
              <TH className="cursor-pointer hover:bg-[var(--line)]" onClick={() => handleSort("amount")}>
                {copy.amount}
              </TH>
              <TH>{copy.label}</TH>
              <TH>{copy.beneficiary}</TH>
              <TH>{copy.account}</TH>
              <TH>CC</TH>
              <TH>{copy.balance}</TH>
              <TH>{copy.actions}</TH>
            </TR>
            <TR className="bg-[var(--panel)] normal-case">
              <TH>
                <Input
                  type="text"
                  placeholder={copy.filter}
                  value={filters.date}
                  onChange={(e) => handleFilterChange("date", e.target.value)}
                  size="sm"
                />
              </TH>
              <TH>
                <Select
                  value={filters.department}
                  onChange={(e) => handleFilterChange("department", e.target.value)}
                  size="sm"
                >
                  <option value="">{copy.all}</option>
                  {uniqueDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </Select>
              </TH>
              <TH>
                <Select
                  value={filters.type}
                  onChange={(e) => handleFilterChange("type", e.target.value)}
                  size="sm"
                >
                  <option value="">{copy.all}</option>
                  <option value="CHARGES">{dictionaries[locale].common.charges}</option>
                  <option value="PRODUITS">{dictionaries[locale].common.produits}</option>
                </Select>
              </TH>
              <TH>
                <Input
                  type="text"
                  placeholder={copy.filter}
                  value={filters.amount}
                  onChange={(e) => handleFilterChange("amount", e.target.value)}
                  size="sm"
                />
              </TH>
              <TH>
                <Input
                  type="text"
                  placeholder={copy.filter}
                  value={filters.label}
                  onChange={(e) => handleFilterChange("label", e.target.value)}
                  size="sm"
                />
              </TH>
              <TH>
                <Input
                  type="text"
                  placeholder={copy.filter}
                  value={filters.beneficiary}
                  onChange={(e) => handleFilterChange("beneficiary", e.target.value)}
                  size="sm"
                />
              </TH>
              <TH>
                <Select
                  value={filters.account}
                  onChange={(e) => handleFilterChange("account", e.target.value)}
                  size="sm"
                >
                  <option value="">{copy.all}</option>
                  {uniqueAccounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </Select>
              </TH>
              <TH>
                <Select
                  value={filters.costCenter}
                  onChange={(e) => handleFilterChange("costCenter", e.target.value)}
                  size="sm"
                >
                  <option value="">{copy.all}</option>
                  {uniqueCostCenters.map((cc) => (
                    <option key={cc} value={cc}>
                      {cc}
                    </option>
                  ))}
                </Select>
              </TH>
              <TH></TH>
              <TH></TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((row) => {
              const entry = row.entry;
              const draft = row.draft;
              return (
                <TR key={entry.id} className={draft ? "bg-[var(--panel-strong)]" : undefined}>
                  <TD>
                    {draft ? (
                      <Input
                        type="date"
                        value={draft.date}
                        onChange={(e) => updateDraft(entry.id, { date: e.target.value })}
                        size="sm"
                      />
                    ) : (
                      row.dateLabel
                    )}
                  </TD>
                  <TD>
                    {draft ? (
                      <Select
                        value={draft.departmentId}
                        onChange={(e) => updateDraft(entry.id, { departmentId: e.target.value })}
                        size="sm"
                      >
                        <option value="">-</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </Select>
                    ) : (
                      row.departmentName
                    )}
                  </TD>
                  <TD>
                    {draft ? (
                      <Select
                        value={draft.accountType}
                        onChange={(e) => updateDraft(entry.id, { accountType: e.target.value })}
                        size="sm"
                      >
                        <option value="CHARGES">{dictionaries[locale].common.charges}</option>
                        <option value="PRODUITS">{dictionaries[locale].common.produits}</option>
                      </Select>
                    ) : (
                      row.typeText
                    )}
                  </TD>
                  <TD>
                    {draft ? (
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={draft.amount}
                        onChange={(e) => updateDraft(entry.id, { amount: e.target.value })}
                        size="sm"
                        className="text-right"
                      />
                    ) : (
                      row.amountLabel
                    )}
                  </TD>
                  <TD>
                    {draft ? (
                      <Input
                        type="text"
                        value={draft.label}
                        onChange={(e) => updateDraft(entry.id, { label: e.target.value })}
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
                        {row.invoiceHref}
                      </a>
                    ) : (
                      <span className="truncate">{entry.label}</span>
                    )}
                  </TD>
                  <TD>{row.beneficiary}</TD>
                  <TD>
                    {draft ? (
                      <Select
                        value={draft.moneyAccountId}
                        onChange={(e) => updateDraft(entry.id, { moneyAccountId: e.target.value })}
                        size="sm"
                      >
                        {moneyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Select>
                    ) : (
                      entry.moneyAccount.name
                    )}
                  </TD>
                  <TD>
                    {draft ? (
                      <Select
                        value={draft.costCenterId}
                        onChange={(e) => updateDraft(entry.id, { costCenterId: e.target.value })}
                        size="sm"
                      >
                        <option value="">-</option>
                        {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code}</option>)}
                      </Select>
                    ) : (
                      row.costCenterCode
                    )}
                  </TD>
                  <TD className="font-semibold">{row.balanceLabel}</TD>
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
                        <IconButton
                          onClick={() => { setEditingId(null); setEditDraft(null); }}
                          tone="neutral"
                          label={shellCopy.cancel}
                        >
                          <X />
                        </IconButton>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <IconButton onClick={() => handleEditStart(entry)} tone="accent" label={copy.edit}>
                          <Pencil />
                        </IconButton>
                        <form action={deleteFormAction}>
                          <input type="hidden" name="journalEntryId" value={entry.id} />
                          <IconButton
                            type="submit"
                            tone="delete"
                            label={row.deleteDisabled ? copy.locked : copy.deleteEntry}
                            disabled={row.deleteDisabled || isDeleting}
                          >
                            <Trash2 />
                          </IconButton>
                        </form>
                      </div>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>

      {/* Below `sm` the 10-column table is unreadable, so the same rows render as
          cards. Filtering and sorting live in the table header and stay desktop-only —
          a phone gets the entries in journal order. */}
      <CardletList className="p-3">
        {rows.map((row) => {
          const draft = row.draft;
          return (
            <Cardlet key={row.entry.id}>
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
                        onChange={(e) => updateDraft(row.entry.id, { label: e.target.value })}
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
                      <p className={cn("mt-1 text-sm font-semibold", row.isProduits ? "text-emerald-300" : null)}>
                        {row.amountLabel}
                      </p>
                    </div>
                  )
                }
              />

              {/* The same seven fields as a table row, stacked — a phone in bulk mode
                  edits the entry it is looking at, it does not leave for a form page. */}
              {draft ? (
                <CardletFields>
                  <CardletField label={copy.date}>
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(e) => updateDraft(row.entry.id, { date: e.target.value })}
                      size="sm"
                    />
                  </CardletField>
                  <CardletField label={copy.amount}>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={draft.amount}
                      onChange={(e) => updateDraft(row.entry.id, { amount: e.target.value })}
                      size="sm"
                      className="text-right"
                    />
                  </CardletField>
                  <CardletField label={copy.type} className="col-span-2">
                    <Select
                      value={draft.accountType}
                      onChange={(e) => updateDraft(row.entry.id, { accountType: e.target.value })}
                      size="sm"
                    >
                      <option value="CHARGES">{dictionaries[locale].common.charges}</option>
                      <option value="PRODUITS">{dictionaries[locale].common.produits}</option>
                    </Select>
                  </CardletField>
                  <CardletField label={copy.department} className="col-span-2">
                    <Select
                      value={draft.departmentId}
                      onChange={(e) => updateDraft(row.entry.id, { departmentId: e.target.value })}
                      size="sm"
                    >
                      <option value="">-</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </Select>
                  </CardletField>
                  <CardletField label={copy.account} className="col-span-2">
                    <Select
                      value={draft.moneyAccountId}
                      onChange={(e) => updateDraft(row.entry.id, { moneyAccountId: e.target.value })}
                      size="sm"
                    >
                      {moneyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  </CardletField>
                  <CardletField label={copy.costCenter} className="col-span-2">
                    <Select
                      value={draft.costCenterId}
                      onChange={(e) => updateDraft(row.entry.id, { costCenterId: e.target.value })}
                      size="sm"
                    >
                      <option value="">-</option>
                      {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code}</option>)}
                    </Select>
                  </CardletField>
                </CardletFields>
              ) : (
                <CardletFields>
                  <CardletField label={copy.department}>{row.departmentName}</CardletField>
                  <CardletField label={copy.account}>{row.entry.moneyAccount.name}</CardletField>
                  <CardletField label={copy.costCenter}>{row.costCenterCode}</CardletField>
                  <CardletField label={copy.beneficiary}>{row.beneficiary}</CardletField>
                </CardletFields>
              )}

              {draft ? null : (
                <p className="text-xs text-[var(--muted)]">
                  {copy.balance}: <span className="font-semibold text-[var(--ink)]">{row.balanceLabel}</span>
                </p>
              )}

              {row.isLocked ? (
                <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{copy.locked}</p>
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
                  <form action={deleteFormAction}>
                    <input type="hidden" name="journalEntryId" value={row.entry.id} />
                    <IconButton
                      type="submit"
                      tone="delete"
                      label={row.deleteDisabled ? copy.locked : copy.deleteEntry}
                      disabled={row.deleteDisabled || isDeleting}
                    >
                      <Trash2 />
                    </IconButton>
                  </form>
                </div>
              )}
            </Cardlet>
          );
        })}
      </CardletList>
    </Panel>
  );
}
