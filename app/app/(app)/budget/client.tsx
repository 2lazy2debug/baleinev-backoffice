"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Pencil, Plus, TrendingDown, TrendingUp, Trash2, X } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState, toActionErrorMessage } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";
import { createDepartmentAction, deleteDepartmentAction } from "@/app/(app)/departments/actions";

import { createBudgetLineAction, deleteBudgetLineAction, updateBudgetLineAction } from "./actions";

type BudgetLineItem = {
  id: string;
  accountType: "CHARGES" | "PRODUITS";
  label: string;
  amount: number;
  notes: string | null;
};

type JournalEntryItem = {
  id: string;
  accountType: "CHARGES" | "PRODUITS";
  label: string;
  amount: number;
  date: string;
  referenceNumber: string | null;
  counterparty: string | null;
};

type DepartmentItem = {
  id: string;
  name: string;
  journalEntriesCount: number;
  budgetLines: BudgetLineItem[];
  journalEntries: JournalEntryItem[];
};

type BudgetPageClientProps = {
  locale: Locale;
  editionName: string;
  departments: DepartmentItem[];
  canManage: boolean;
  emptyStateMessage: string;
};

export default function BudgetPageClient({ locale, editionName, departments, canManage: canManageProp, emptyStateMessage }: BudgetPageClientProps) {
  const isReadOnly = useEditionReadOnly();
  // A closed edition is read-only, so it takes the same path as "not allowed to manage".
  const canManage = canManageProp && !isReadOnly;
  const copy = dictionaries[locale];
  const router = useRouter();

  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false);
  const [entryModalDepartment, setEntryModalDepartment] = useState<{ id: string; name: string } | null>(null);
  const [editingBudgetLineId, setEditingBudgetLineId] = useState<string | null>(null);
  const [editBudgetDraft, setEditBudgetDraft] = useState<{ label: string; amount: string; notes: string } | null>(null);
  const [detailsDepartment, setDetailsDepartment] = useState<DepartmentItem | null>(null);

  async function handleCreateDepartment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
    const result = await createDepartmentAction(_prevState, formData);
    if (!result.error) {
      setIsDepartmentModalOpen(false);
      router.refresh();
    }
    return result;
  }
  const [createDeptState, createDeptFormAction, isSavingDepartment] = useActionState(
    handleCreateDepartment,
    initialActionState
  );

  async function handleCreateBudgetLine(_prevState: ActionState, formData: FormData): Promise<ActionState> {
    const result = await createBudgetLineAction(_prevState, formData);
    if (!result.error) {
      setEntryModalDepartment(null);
      router.refresh();
    }
    return result;
  }
  const [createLineState, createLineFormAction, isSavingBudgetLine] = useActionState(
    handleCreateBudgetLine,
    initialActionState
  );

  const [deleteDeptState, deleteDeptFormAction, isDeletingDept] = useActionState(
    deleteDepartmentAction,
    initialActionState
  );
  const [deleteLineState, deleteLineFormAction, isDeletingLine] = useActionState(
    deleteBudgetLineAction,
    initialActionState
  );

  async function handleSaveBudgetLine(_prevState: ActionState): Promise<ActionState> {
    if (!editingBudgetLineId || !editBudgetDraft) {
      return { error: null };
    }
    try {
      const formData = new FormData();
      formData.set("budgetLineId", editingBudgetLineId);
      formData.set("label", editBudgetDraft.label);
      formData.set("amount", editBudgetDraft.amount);
      formData.set("notes", editBudgetDraft.notes);
      const result = await updateBudgetLineAction(_prevState, formData);
      if (result.error) {
        return result;
      }
      setEditingBudgetLineId(null);
      setEditBudgetDraft(null);
      router.refresh();
      return result;
    } catch (err) {
      return { error: toActionErrorMessage(err) };
    }
  }
  const [saveLineState, saveLineFormAction, isSavingBudgetEdit] = useActionState(
    handleSaveBudgetLine,
    initialActionState
  );

  const inp = "w-full text-xs rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.budget.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.budget.entriesFor} {editionName}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">{copy.budget.subtitle}</p>
        {canManage ? (
          <button
            type="button"
            onClick={() => setIsDepartmentModalOpen(true)}
            className="inline-flex items-center gap-2 border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--panel)]"
          >
            <Plus className="h-4 w-4" />
            {copy.budget.addDepartment}
          </button>
        ) : null}
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <FormError message={deleteDeptState.error} className="md:col-span-2" />
        <FormError message={deleteLineState.error} className="md:col-span-2" />
        <FormError message={saveLineState.error} className="md:col-span-2" />
        {departments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)] md:col-span-2">
            {emptyStateMessage}
          </div>
        ) : (
          departments.map((department) => {
            const chargesLines = department.budgetLines.filter((line) => line.accountType === "CHARGES");
            const produitsLines = department.budgetLines.filter((line) => line.accountType === "PRODUITS");

            const chargesTotal = chargesLines.reduce((total, line) => total + line.amount, 0);
            const produitsTotal = produitsLines.reduce((total, line) => total + line.amount, 0);
            const result = produitsTotal - chargesTotal;

            const canDeleteDept = department.budgetLines.length === 0 && department.journalEntriesCount === 0;

            return (
              <article key={department.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{department.name}</h2>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      {department.budgetLines.length} {copy.budget.budgetEntries}
                    </p>
                    {department.budgetLines.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                        <span className={result >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatCurrency(result)}</span>
                        {result >= 0
                          ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                          : <TrendingDown className="h-4 w-4 text-rose-400" />}
                      </div>
                    )}
                  </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailsDepartment(department)}
                        title={copy.budget.viewDetails}
                        className="rounded-md border border-[var(--line)] p-2 text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {canManage ? (
                        <>
                      <button
                        type="button"
                        onClick={() => setEntryModalDepartment({ id: department.id, name: department.name })}
                        title={copy.budget.addBudgetEntry}
                        className="rounded-md border border-[var(--line)] p-2 text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <form action={deleteDeptFormAction}>
                        <input type="hidden" name="departmentId" value={department.id} />
                        <button
                          disabled={!canDeleteDept || isDeletingDept}
                          title={canDeleteDept ? copy.budget.deleteDepartment : copy.budget.cannotDeleteDepartment}
                          className="rounded-md border border-rose-300 p-2 text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)] disabled:hover:bg-transparent"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {/* CHARGES TABLE */}
                  <section>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.common.charges}</p>
                    <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--panel-strong)] text-[var(--muted)]">
                          <tr>
                            <th className="px-3 py-2 font-medium">{copy.budget.label}</th>
                            <th className="px-3 py-2 font-medium">{copy.budget.notes}</th>
                            <th className="px-3 py-2 font-medium text-right">{copy.budget.amount}</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {chargesLines.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-3 text-xs text-[var(--muted)]">{copy.budget.noSpendingEntries}</td>
                            </tr>
                          ) : (
                            chargesLines.map((line) => {
                              const isEditingLine = editingBudgetLineId === line.id;
                              return (
                                <tr key={line.id} className={`border-t border-[var(--line)] ${isEditingLine ? "bg-[var(--panel)]" : ""}`}>
                                  <td className="px-3 py-2">
                                    {isEditingLine
                                      ? <input type="text" value={editBudgetDraft!.label} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, label: e.target.value })} className={inp} />
                                      : <span className="font-medium">{line.label}</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {isEditingLine
                                      ? <input type="text" value={editBudgetDraft!.notes} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, notes: e.target.value })} className={inp} />
                                      : <span className="text-xs text-[var(--muted)]">{line.notes ?? "-"}</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {isEditingLine
                                      ? <input type="number" step="0.01" min="0.01" value={editBudgetDraft!.amount} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, amount: e.target.value })} className={`${inp} text-right`} />
                                      : <span className="font-semibold">{formatCurrency(line.amount)}</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {canManage && isEditingLine ? (
                                      <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => saveLineFormAction()} disabled={isSavingBudgetEdit} className="rounded-md border border-emerald-400 p-1.5 text-emerald-400 hover:bg-emerald-950/40 disabled:opacity-50">
                                          <Check className="h-3 w-3" />
                                        </button>
                                        <button onClick={() => { setEditingBudgetLineId(null); setEditBudgetDraft(null); }} className="rounded-md border border-[var(--line)] p-1.5 text-[var(--muted)] hover:bg-[var(--panel-strong)]">
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : canManage ? (
                                      <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => { setEditingBudgetLineId(line.id); setEditBudgetDraft({ label: line.label, amount: line.amount.toString(), notes: line.notes ?? "" }); }} className="rounded-md border border-[var(--line)] p-1.5 text-[var(--muted)] hover:bg-[var(--panel-strong)]">
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                        <form action={deleteLineFormAction}>
                                          <input type="hidden" name="budgetLineId" value={line.id} />
                                          <button disabled={isDeletingLine} title={copy.budget.deleteDepartment} className="rounded-md border border-rose-300 p-1.5 text-rose-300 hover:bg-rose-950/40 disabled:opacity-50">
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </form>
                                      </div>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {chargesLines.length > 0 && (
                          <tfoot className="border-t-2 border-[var(--line)] bg-[var(--panel-strong)]">
                            <tr>
                              <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-[var(--muted)]">{copy.common.total}</td>
                              <td className="px-3 py-2 text-right font-semibold">{formatCurrency(chargesTotal)}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>

                  {/* PRODUITS TABLE */}
                  <section>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.common.produits}</p>
                    <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--panel-strong)] text-[var(--muted)]">
                          <tr>
                            <th className="px-3 py-2 font-medium">{copy.budget.label}</th>
                            <th className="px-3 py-2 font-medium">{copy.budget.notes}</th>
                            <th className="px-3 py-2 font-medium text-right">{copy.budget.amount}</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {produitsLines.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-3 text-xs text-[var(--muted)]">{copy.budget.noEarningsEntries}</td>
                            </tr>
                          ) : (
                            produitsLines.map((line) => {
                              const isEditingLine = editingBudgetLineId === line.id;
                              return (
                                <tr key={line.id} className={`border-t border-[var(--line)] ${isEditingLine ? "bg-[var(--panel)]" : ""}`}>
                                  <td className="px-3 py-2">
                                    {isEditingLine
                                      ? <input type="text" value={editBudgetDraft!.label} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, label: e.target.value })} className={inp} />
                                      : <span className="font-medium">{line.label}</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {isEditingLine
                                      ? <input type="text" value={editBudgetDraft!.notes} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, notes: e.target.value })} className={inp} />
                                      : <span className="text-xs text-[var(--muted)]">{line.notes ?? "-"}</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {isEditingLine
                                      ? <input type="number" step="0.01" min="0.01" value={editBudgetDraft!.amount} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, amount: e.target.value })} className={`${inp} text-right`} />
                                      : <span className="font-semibold">{formatCurrency(line.amount)}</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {canManage && isEditingLine ? (
                                      <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => saveLineFormAction()} disabled={isSavingBudgetEdit} className="rounded-md border border-emerald-400 p-1.5 text-emerald-400 hover:bg-emerald-950/40 disabled:opacity-50">
                                          <Check className="h-3 w-3" />
                                        </button>
                                        <button onClick={() => { setEditingBudgetLineId(null); setEditBudgetDraft(null); }} className="rounded-md border border-[var(--line)] p-1.5 text-[var(--muted)] hover:bg-[var(--panel-strong)]">
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : canManage ? (
                                      <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => { setEditingBudgetLineId(line.id); setEditBudgetDraft({ label: line.label, amount: line.amount.toString(), notes: line.notes ?? "" }); }} className="rounded-md border border-[var(--line)] p-1.5 text-[var(--muted)] hover:bg-[var(--panel-strong)]">
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                        <form action={deleteLineFormAction}>
                                          <input type="hidden" name="budgetLineId" value={line.id} />
                                          <button disabled={isDeletingLine} title={copy.budget.deleteDepartment} className="rounded-md border border-rose-300 p-1.5 text-rose-300 hover:bg-rose-950/40 disabled:opacity-50">
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </form>
                                      </div>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {produitsLines.length > 0 && (
                          <tfoot className="border-t-2 border-[var(--line)] bg-[var(--panel-strong)]">
                            <tr>
                              <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-[var(--muted)]">{copy.common.total}</td>
                              <td className="px-3 py-2 text-right font-semibold">{formatCurrency(produitsTotal)}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>
                </div>
              </article>
            );
          })
        )}
      </section>

      {detailsDepartment ? (
        (() => {
          const budgetChargesLines = detailsDepartment.budgetLines.filter((line) => line.accountType === "CHARGES");
          const budgetProduitsLines = detailsDepartment.budgetLines.filter((line) => line.accountType === "PRODUITS");
          const journalChargesEntries = detailsDepartment.journalEntries.filter((entry) => entry.accountType === "CHARGES");
          const journalProduitsEntries = detailsDepartment.journalEntries.filter((entry) => entry.accountType === "PRODUITS");

          const chargesBudgetTotal = budgetChargesLines.reduce((total, line) => total + line.amount, 0);
          const chargesActualTotal = journalChargesEntries.reduce((total, entry) => total + entry.amount, 0);
          const produitsBudgetTotal = budgetProduitsLines.reduce((total, line) => total + line.amount, 0);
          const produitsActualTotal = journalProduitsEntries.reduce((total, entry) => total + entry.amount, 0);

          const chargesAvailability = chargesBudgetTotal - chargesActualTotal;
          const budgetResult = produitsBudgetTotal - chargesBudgetTotal;
          const actualResult = produitsActualTotal - chargesActualTotal;

          return (
            <>
              <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setDetailsDepartment(null)} />
              <div className="fixed left-1/2 top-1/2 z-50 h-[90vh] w-[95vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-lg">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">{copy.budget.detailsTitle} - {detailsDepartment.name}</h2>
                  <button
                    type="button"
                    onClick={() => setDetailsDepartment(null)}
                    className="text-[var(--muted)] hover:text-[var(--ink)]"
                    aria-label={copy.shell.cancel}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mb-5 grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{copy.budget.chargesAvailability}</p>
                    <p className={`text-sm font-semibold ${chargesAvailability >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {chargesAvailability >= 0 ? copy.budget.available : copy.budget.overexpense} {formatCurrency(Math.abs(chargesAvailability))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{copy.budget.budgetResult}</p>
                    <p className="text-sm font-semibold">{formatCurrency(budgetResult)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{copy.budget.actualResult}</p>
                    <p className="text-sm font-semibold">{formatCurrency(actualResult)}</p>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-5 lg:max-h-[62vh] lg:overflow-y-auto lg:pr-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.budget.budgetEntries}</p>
                    {([
                      ["CHARGES", budgetChargesLines, chargesBudgetTotal],
                      ["PRODUITS", budgetProduitsLines, produitsBudgetTotal],
                    ] as const).map(([accountType, lines, total]) => (
                      <section key={accountType} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          {accountType === "CHARGES" ? copy.common.charges : copy.common.produits}
                        </p>
                        <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-[var(--panel-strong)] text-[var(--muted)]">
                              <tr>
                                <th className="px-3 py-2 font-medium">{copy.budget.label}</th>
                                <th className="px-3 py-2 font-medium">{copy.budget.notes}</th>
                                <th className="px-3 py-2 font-medium text-right">{copy.budget.amount}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="px-3 py-3 text-xs text-[var(--muted)]">
                                    {accountType === "CHARGES" ? copy.budget.noSpendingEntries : copy.budget.noEarningsEntries}
                                  </td>
                                </tr>
                              ) : (
                                lines.map((line) => (
                                  <tr key={`${accountType}-${line.id}`} className="border-t border-[var(--line)]">
                                    <td className="px-3 py-2 font-medium">{line.label}</td>
                                    <td className="px-3 py-2 text-xs text-[var(--muted)]">{line.notes ?? "-"}</td>
                                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(line.amount)}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                            {lines.length > 0 ? (
                              <tfoot className="border-t-2 border-[var(--line)] bg-[var(--panel-strong)]">
                                <tr>
                                  <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-[var(--muted)]">{copy.common.total}</td>
                                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(total)}</td>
                                </tr>
                              </tfoot>
                            ) : null}
                          </table>
                        </div>
                      </section>
                    ))}
                  </div>

                  <div className="space-y-2 lg:max-h-[62vh] lg:overflow-y-auto lg:pl-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.budget.journalEntries}</p>
                    <div className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{copy.common.charges}</p>
                        <p className="text-sm font-semibold text-rose-300">{formatCurrency(chargesActualTotal)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{copy.common.produits}</p>
                        <p className="text-sm font-semibold text-emerald-300">{formatCurrency(produitsActualTotal)}</p>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--panel-strong)] text-[var(--muted)]">
                          <tr>
                            <th className="px-3 py-2 font-medium">{copy.journal.date}</th>
                            <th className="px-3 py-2 font-medium">{copy.journal.type}</th>
                            <th className="px-3 py-2 font-medium">{copy.budget.label}</th>
                            <th className="px-3 py-2 font-medium">{copy.journal.counterparty}</th>
                            <th className="px-3 py-2 font-medium">{copy.journal.reference}</th>
                            <th className="px-3 py-2 font-medium text-right">{copy.budget.amount}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailsDepartment.journalEntries.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-3 text-xs text-[var(--muted)]">{copy.budget.noJournalEntries}</td>
                            </tr>
                          ) : (
                            detailsDepartment.journalEntries.map((entry) => (
                              <tr key={entry.id} className="border-t border-[var(--line)]">
                                <td className="px-3 py-2">{new Date(entry.date).toLocaleDateString(locale)}</td>
                                <td className="px-3 py-2 text-xs text-[var(--muted)]">{entry.accountType === "CHARGES" ? copy.common.charges : copy.common.produits}</td>
                                <td className="px-3 py-2">{entry.label}</td>
                                <td className="px-3 py-2 text-xs text-[var(--muted)]">{entry.counterparty ?? "-"}</td>
                                <td className="px-3 py-2 text-xs text-[var(--muted)]">{entry.referenceNumber ?? "-"}</td>
                                <td className={`px-3 py-2 text-right font-semibold ${entry.accountType === "CHARGES" ? "text-rose-300" : "text-emerald-300"}`}>
                                  {formatCurrency(entry.amount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </>
          );
        })()
      ) : null}

      {canManage && isDepartmentModalOpen ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setIsDepartmentModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-lg">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{copy.budget.addDepartment}</h2>
              <button
                type="button"
                onClick={() => setIsDepartmentModalOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--ink)]"
                aria-label={copy.shell.cancel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form action={createDeptFormAction} className="space-y-4">
              <FormError message={createDeptState.error} />
              <label className="block space-y-2">
                <span className="text-sm font-medium">{copy.budget.departmentName}</span>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDepartmentModalOpen(false)}
                  className="rounded-md border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--panel-strong)]"
                >
                  {copy.shell.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSavingDepartment}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
                >
                  {isSavingDepartment ? copy.journal.saving : copy.budget.addDepartment}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}

      {canManage && entryModalDepartment ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setEntryModalDepartment(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-lg">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{copy.budget.addBudgetEntry} - {entryModalDepartment.name}</h2>
              <button
                type="button"
                onClick={() => setEntryModalDepartment(null)}
                className="text-[var(--muted)] hover:text-[var(--ink)]"
                aria-label={copy.shell.cancel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form action={createLineFormAction} className="space-y-4">
              <FormError message={createLineState.error} />
              <input type="hidden" name="departmentId" value={entryModalDepartment.id} />

              <label className="block space-y-2">
                <span className="text-sm font-medium">{copy.budget.type}</span>
                <select
                  name="accountType"
                  defaultValue="CHARGES"
                  required
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                >
                  <option value="CHARGES">{copy.common.charges}</option>
                  <option value="PRODUITS">{copy.common.produits}</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">{copy.budget.label}</span>
                <input
                  type="text"
                  name="label"
                  required
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">{copy.budget.amount}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="amount"
                  required
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">{copy.budget.notesOptional}</span>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEntryModalDepartment(null)}
                  className="rounded-md border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--panel-strong)]"
                >
                  {copy.shell.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSavingBudgetLine}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
                >
                  {isSavingBudgetLine ? copy.journal.saving : copy.budget.addBudgetEntry}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
