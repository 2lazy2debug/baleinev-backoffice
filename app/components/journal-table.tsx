"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { deleteJournalEntryAction, updateJournalEntryAction } from "@/app/(app)/journal/actions";
import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { IconButton, Input, Select, TD, TH, THead, TR } from "@/components/ui";
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
};

function typeLabel(type: string, locale: Locale) {
  const copy = dictionaries[locale].common;
  return type === "PRODUITS" ? copy.produits : copy.charges;
}

export function JournalTable({ entries, accountBalances, accountOpeningBalances, locale, departments, moneyAccounts, costCenters }: JournalTableProps) {
  const copy = dictionaries[locale].journal;

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
  const [editDraft, setEditDraft] = useState<{
    date: string;
    departmentId: string;
    accountType: string;
    amount: string;
    label: string;
    moneyAccountId: string;
    costCenterId: string;
  } | null>(null);
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
    setEditDraft({
      date: entry.date.toISOString().slice(0, 10),
      departmentId: entry.departmentId ?? "",
      accountType: entry.accountType,
      amount: Number(entry.amount).toFixed(2),
      label: entry.label,
      moneyAccountId: entry.moneyAccountId,
      costCenterId: entry.costCenterId ?? "",
    });
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

  const uniqueDepartments = [...new Set(entries.map((e) => e.department?.name).filter(Boolean))];
  const uniqueAccounts = [...new Set(entries.map((e) => e.moneyAccount.name))];
  const uniqueCostCenters = [...new Set(entries.map((e) => e.costCenter?.code).filter(Boolean))];

  return (
    <div className="border border-[var(--line)] bg-[var(--panel)] rounded-2xl overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 shrink-0">
        <h2 className="text-lg font-semibold">{copy.entries}</h2>
        <p className="text-xs text-[var(--muted)]">{copy.showing} {sortedEntries.length} {copy.of} {entries.length}</p>
      </div>
      {(saveState.error || deleteState.error) ? (
        <div className="border-b border-[var(--line)] px-4 py-2 shrink-0">
          <FormError message={saveState.error ?? deleteState.error} />
        </div>
      ) : null}

      <div className="flex-1 overflow-auto">
        <table ref={tableRef} className="w-full table-fixed text-left text-sm">
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
            {sortedEntries.map((entry) => {
              const isEditing = editingId === entry.id;
              return (
                <TR key={entry.id} className={isEditing ? "bg-[var(--panel-strong)]" : undefined}>
                  <TD>
                    {isEditing ? (
                      <Input
                        type="date"
                        value={editDraft!.date}
                        onChange={(e) => setEditDraft({ ...editDraft!, date: e.target.value })}
                        size="sm"
                      />
                    ) : (
                      entry.date.toISOString().slice(0, 10)
                    )}
                  </TD>
                  <TD>
                    {isEditing ? (
                      <Select
                        value={editDraft!.departmentId}
                        onChange={(e) => setEditDraft({ ...editDraft!, departmentId: e.target.value })}
                        size="sm"
                      >
                        <option value="">-</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </Select>
                    ) : (
                      entry.department?.name ?? "-"
                    )}
                  </TD>
                  <TD>
                    {isEditing ? (
                      <Select
                        value={editDraft!.accountType}
                        onChange={(e) => setEditDraft({ ...editDraft!, accountType: e.target.value })}
                        size="sm"
                      >
                        <option value="CHARGES">{dictionaries[locale].common.charges}</option>
                        <option value="PRODUITS">{dictionaries[locale].common.produits}</option>
                      </Select>
                    ) : (
                      typeLabel(entry.accountType, locale)
                    )}
                  </TD>
                  <TD>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={editDraft!.amount}
                        onChange={(e) => setEditDraft({ ...editDraft!, amount: e.target.value })}
                        size="sm"
                        className="text-right"
                      />
                    ) : (
                      formatCurrency(Number(entry.amount.toString()))
                    )}
                  </TD>
                  <TD>
                    {isEditing ? (
                      <Input
                        type="text"
                        value={editDraft!.label}
                        onChange={(e) => setEditDraft({ ...editDraft!, label: e.target.value })}
                        size="sm"
                      />
                    ) : entry.linkedInvoice ? (
                      <a
                        href={`/api/invoices/${entry.linkedInvoice.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[var(--accent)] hover:underline"
                        title={entry.linkedInvoice.invoiceNumber}
                      >
                        {`/api/invoices/${entry.linkedInvoice.id}/pdf`}
                      </a>
                    ) : (
                      <span className="truncate">{entry.label}</span>
                    )}
                  </TD>
                  <TD>{entry.counterparty ?? "-"}</TD>
                  <TD>
                    {isEditing ? (
                      <Select
                        value={editDraft!.moneyAccountId}
                        onChange={(e) => setEditDraft({ ...editDraft!, moneyAccountId: e.target.value })}
                        size="sm"
                      >
                        {moneyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Select>
                    ) : (
                      entry.moneyAccount.name
                    )}
                  </TD>
                  <TD>
                    {isEditing ? (
                      <Select
                        value={editDraft!.costCenterId}
                        onChange={(e) => setEditDraft({ ...editDraft!, costCenterId: e.target.value })}
                        size="sm"
                      >
                        <option value="">-</option>
                        {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code}</option>)}
                      </Select>
                    ) : (
                      entry.costCenter?.code ?? "-"
                    )}
                  </TD>
                  <TD className="font-semibold">
                    {formatCurrency(runningBalanceByEntryId[entry.id] ?? accountBalances[entry.moneyAccount.name] ?? 0)}
                  </TD>
                  <TD>
                    {entry.isOpeningEntry || isReadOnly ? (
                      <span className="text-xs text-[var(--muted)]">{copy.locked}</span>
                    ) : isEditing ? (
                      <div className="flex items-center gap-2">
                        <IconButton
                          onClick={() => saveFormAction()}
                          disabled={isSaving}
                          tone="save"
                          label={dictionaries[locale].shell.save}
                        >
                          <Check />
                        </IconButton>
                        <IconButton
                          onClick={() => { setEditingId(null); setEditDraft(null); }}
                          tone="neutral"
                          label={dictionaries[locale].shell.cancel}
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
                            label={entry.linkedInvoice ? copy.locked : copy.actions}
                            disabled={Boolean(entry.linkedInvoice) || isDeleting}
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
        </table>
      </div>
    </div>
  );
}
