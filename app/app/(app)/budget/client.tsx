"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Pencil, Plus, TrendingDown, TrendingUp, Trash2, X } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { Button, Card, CardGrid, Field, IconButton, Input, Modal, PageHeader, Select, TD, TFoot, TH, THead, TR, Table, Textarea } from "@/components/ui";
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={copy.budget.title}
        title={<>{copy.budget.entriesFor} {editionName}</>}
        description={copy.budget.subtitle}
        actions={canManage ? (
          <Button variant="secondary" onClick={() => setIsDepartmentModalOpen(true)}>
            <Plus />
            {copy.budget.addDepartment}
          </Button>
        ) : null}
      />

      <div className="space-y-4">
        <FormError message={deleteDeptState.error} />
        <FormError message={deleteLineState.error} />
        <FormError message={saveLineState.error} />
        {departments.length === 0 ? (
          <CardGrid>
            <Card span="full" dashed>{emptyStateMessage}</Card>
          </CardGrid>
        ) : (
          <CardGrid>
            {departments.map((department) => {
              const chargesLines = department.budgetLines.filter((line) => line.accountType === "CHARGES");
              const produitsLines = department.budgetLines.filter((line) => line.accountType === "PRODUITS");

              const chargesTotal = chargesLines.reduce((total, line) => total + line.amount, 0);
              const produitsTotal = produitsLines.reduce((total, line) => total + line.amount, 0);
              const result = produitsTotal - chargesTotal;

              const canDeleteDept = department.budgetLines.length === 0 && department.journalEntriesCount === 0;

              return (
                <Card key={department.id} as="article" span="1/2">
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
                      <IconButton tone="neutral" label={copy.budget.viewDetails} onClick={() => setDetailsDepartment(department)}>
                        <Eye />
                      </IconButton>
                      {canManage ? (
                        <>
                          <IconButton
                            tone="neutral"
                            label={copy.budget.addBudgetEntry}
                            onClick={() => setEntryModalDepartment({ id: department.id, name: department.name })}
                          >
                            <Plus />
                          </IconButton>
                          <form action={deleteDeptFormAction}>
                            <input type="hidden" name="departmentId" value={department.id} />
                            <IconButton
                              type="submit"
                              tone="delete"
                              label={canDeleteDept ? copy.budget.deleteDepartment : copy.budget.cannotDeleteDepartment}
                              disabled={!canDeleteDept || isDeletingDept}
                            >
                              <Trash2 />
                            </IconButton>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    {/* CHARGES TABLE */}
                    <section>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.common.charges}</p>
                      <Table>
                        <THead>
                          <TR>
                            <TH>{copy.budget.label}</TH>
                            <TH>{copy.budget.notes}</TH>
                            <TH className="text-right">{copy.budget.amount}</TH>
                            <TH></TH>
                          </TR>
                        </THead>
                        <tbody>
                          {chargesLines.length === 0 ? (
                            <TR>
                              <TD colSpan={4} className="text-xs text-[var(--muted)]">{copy.budget.noSpendingEntries}</TD>
                            </TR>
                          ) : (
                            chargesLines.map((line) => {
                              const isEditingLine = editingBudgetLineId === line.id;
                              return (
                                <TR key={line.id} className={isEditingLine ? "bg-[var(--panel)]" : ""}>
                                  <TD>
                                    {isEditingLine
                                      ? <Input type="text" size="sm" value={editBudgetDraft!.label} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, label: e.target.value })} />
                                      : <span className="font-medium">{line.label}</span>}
                                  </TD>
                                  <TD>
                                    {isEditingLine
                                      ? <Input type="text" size="sm" value={editBudgetDraft!.notes} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, notes: e.target.value })} />
                                      : <span className="text-xs text-[var(--muted)]">{line.notes ?? "-"}</span>}
                                  </TD>
                                  <TD className="text-right">
                                    {isEditingLine
                                      ? <Input type="number" step="0.01" min="0.01" size="sm" className="text-right" value={editBudgetDraft!.amount} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, amount: e.target.value })} />
                                      : <span className="font-semibold">{formatCurrency(line.amount)}</span>}
                                  </TD>
                                  <TD>
                                    {canManage && isEditingLine ? (
                                      <div className="flex items-center justify-end gap-2">
                                        <IconButton tone="save" label={copy.shell.save} onClick={() => saveLineFormAction()} disabled={isSavingBudgetEdit}>
                                          <Check />
                                        </IconButton>
                                        <IconButton tone="neutral" label={copy.shell.cancel} onClick={() => { setEditingBudgetLineId(null); setEditBudgetDraft(null); }}>
                                          <X />
                                        </IconButton>
                                      </div>
                                    ) : canManage ? (
                                      <div className="flex items-center justify-end gap-2">
                                        <IconButton
                                          tone="neutral"
                                          label={copy.journal.edit}
                                          onClick={() => { setEditingBudgetLineId(line.id); setEditBudgetDraft({ label: line.label, amount: line.amount.toString(), notes: line.notes ?? "" }); }}
                                        >
                                          <Pencil />
                                        </IconButton>
                                        <form action={deleteLineFormAction}>
                                          <input type="hidden" name="budgetLineId" value={line.id} />
                                          <IconButton type="submit" tone="delete" label={copy.budget.deleteDepartment} disabled={isDeletingLine}>
                                            <Trash2 />
                                          </IconButton>
                                        </form>
                                      </div>
                                    ) : null}
                                  </TD>
                                </TR>
                              );
                            })
                          )}
                        </tbody>
                        {chargesLines.length > 0 && (
                          <TFoot>
                            <TR>
                              <TD colSpan={2} className="text-xs font-semibold text-[var(--muted)]">{copy.common.total}</TD>
                              <TD className="text-right font-semibold">{formatCurrency(chargesTotal)}</TD>
                              <TD></TD>
                            </TR>
                          </TFoot>
                        )}
                      </Table>
                    </section>

                    {/* PRODUITS TABLE */}
                    <section>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.common.produits}</p>
                      <Table>
                        <THead>
                          <TR>
                            <TH>{copy.budget.label}</TH>
                            <TH>{copy.budget.notes}</TH>
                            <TH className="text-right">{copy.budget.amount}</TH>
                            <TH></TH>
                          </TR>
                        </THead>
                        <tbody>
                          {produitsLines.length === 0 ? (
                            <TR>
                              <TD colSpan={4} className="text-xs text-[var(--muted)]">{copy.budget.noEarningsEntries}</TD>
                            </TR>
                          ) : (
                            produitsLines.map((line) => {
                              const isEditingLine = editingBudgetLineId === line.id;
                              return (
                                <TR key={line.id} className={isEditingLine ? "bg-[var(--panel)]" : ""}>
                                  <TD>
                                    {isEditingLine
                                      ? <Input type="text" size="sm" value={editBudgetDraft!.label} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, label: e.target.value })} />
                                      : <span className="font-medium">{line.label}</span>}
                                  </TD>
                                  <TD>
                                    {isEditingLine
                                      ? <Input type="text" size="sm" value={editBudgetDraft!.notes} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, notes: e.target.value })} />
                                      : <span className="text-xs text-[var(--muted)]">{line.notes ?? "-"}</span>}
                                  </TD>
                                  <TD className="text-right">
                                    {isEditingLine
                                      ? <Input type="number" step="0.01" min="0.01" size="sm" className="text-right" value={editBudgetDraft!.amount} onChange={(e) => setEditBudgetDraft({ ...editBudgetDraft!, amount: e.target.value })} />
                                      : <span className="font-semibold">{formatCurrency(line.amount)}</span>}
                                  </TD>
                                  <TD>
                                    {canManage && isEditingLine ? (
                                      <div className="flex items-center justify-end gap-2">
                                        <IconButton tone="save" label={copy.shell.save} onClick={() => saveLineFormAction()} disabled={isSavingBudgetEdit}>
                                          <Check />
                                        </IconButton>
                                        <IconButton tone="neutral" label={copy.shell.cancel} onClick={() => { setEditingBudgetLineId(null); setEditBudgetDraft(null); }}>
                                          <X />
                                        </IconButton>
                                      </div>
                                    ) : canManage ? (
                                      <div className="flex items-center justify-end gap-2">
                                        <IconButton
                                          tone="neutral"
                                          label={copy.journal.edit}
                                          onClick={() => { setEditingBudgetLineId(line.id); setEditBudgetDraft({ label: line.label, amount: line.amount.toString(), notes: line.notes ?? "" }); }}
                                        >
                                          <Pencil />
                                        </IconButton>
                                        <form action={deleteLineFormAction}>
                                          <input type="hidden" name="budgetLineId" value={line.id} />
                                          <IconButton type="submit" tone="delete" label={copy.budget.deleteDepartment} disabled={isDeletingLine}>
                                            <Trash2 />
                                          </IconButton>
                                        </form>
                                      </div>
                                    ) : null}
                                  </TD>
                                </TR>
                              );
                            })
                          )}
                        </tbody>
                        {produitsLines.length > 0 && (
                          <TFoot>
                            <TR>
                              <TD colSpan={2} className="text-xs font-semibold text-[var(--muted)]">{copy.common.total}</TD>
                              <TD className="text-right font-semibold">{formatCurrency(produitsTotal)}</TD>
                              <TD></TD>
                            </TR>
                          </TFoot>
                        )}
                      </Table>
                    </section>
                  </div>
                </Card>
              );
            })}
          </CardGrid>
        )}
      </div>

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
            <Modal
              open
              onClose={() => setDetailsDepartment(null)}
              title={`${copy.budget.detailsTitle} - ${detailsDepartment.name}`}
              size="full"
            >
              <Card as="div" className="mb-5 grid gap-3 sm:grid-cols-3">
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
              </Card>

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
                      <Table>
                        <THead>
                          <TR>
                            <TH>{copy.budget.label}</TH>
                            <TH>{copy.budget.notes}</TH>
                            <TH className="text-right">{copy.budget.amount}</TH>
                          </TR>
                        </THead>
                        <tbody>
                          {lines.length === 0 ? (
                            <TR>
                              <TD colSpan={3} className="text-xs text-[var(--muted)]">
                                {accountType === "CHARGES" ? copy.budget.noSpendingEntries : copy.budget.noEarningsEntries}
                              </TD>
                            </TR>
                          ) : (
                            lines.map((line) => (
                              <TR key={`${accountType}-${line.id}`}>
                                <TD className="font-medium">{line.label}</TD>
                                <TD className="text-xs text-[var(--muted)]">{line.notes ?? "-"}</TD>
                                <TD className="text-right font-semibold">{formatCurrency(line.amount)}</TD>
                              </TR>
                            ))
                          )}
                        </tbody>
                        {lines.length > 0 ? (
                          <TFoot>
                            <TR>
                              <TD colSpan={2} className="text-xs font-semibold text-[var(--muted)]">{copy.common.total}</TD>
                              <TD className="text-right font-semibold">{formatCurrency(total)}</TD>
                            </TR>
                          </TFoot>
                        ) : null}
                      </Table>
                    </section>
                  ))}
                </div>

                <div className="space-y-2 lg:max-h-[62vh] lg:overflow-y-auto lg:pl-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.budget.journalEntries}</p>
                  <Card as="div" className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-2xs uppercase tracking-[0.14em] text-[var(--muted)]">{copy.common.charges}</p>
                      <p className="text-sm font-semibold text-rose-300">{formatCurrency(chargesActualTotal)}</p>
                    </div>
                    <div>
                      <p className="text-2xs uppercase tracking-[0.14em] text-[var(--muted)]">{copy.common.produits}</p>
                      <p className="text-sm font-semibold text-emerald-300">{formatCurrency(produitsActualTotal)}</p>
                    </div>
                  </Card>
                  <Table>
                    <THead>
                      <TR>
                        <TH>{copy.journal.date}</TH>
                        <TH>{copy.journal.type}</TH>
                        <TH>{copy.budget.label}</TH>
                        <TH>{copy.journal.counterparty}</TH>
                        <TH>{copy.journal.reference}</TH>
                        <TH className="text-right">{copy.budget.amount}</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {detailsDepartment.journalEntries.length === 0 ? (
                        <TR>
                          <TD colSpan={6} className="text-xs text-[var(--muted)]">{copy.budget.noJournalEntries}</TD>
                        </TR>
                      ) : (
                        detailsDepartment.journalEntries.map((entry) => (
                          <TR key={entry.id}>
                            <TD>{new Date(entry.date).toLocaleDateString(locale)}</TD>
                            <TD className="text-xs text-[var(--muted)]">{entry.accountType === "CHARGES" ? copy.common.charges : copy.common.produits}</TD>
                            <TD>{entry.label}</TD>
                            <TD className="text-xs text-[var(--muted)]">{entry.counterparty ?? "-"}</TD>
                            <TD className="text-xs text-[var(--muted)]">{entry.referenceNumber ?? "-"}</TD>
                            <TD className={`text-right font-semibold ${entry.accountType === "CHARGES" ? "text-rose-300" : "text-emerald-300"}`}>
                              {formatCurrency(entry.amount)}
                            </TD>
                          </TR>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
              </div>
            </Modal>
          );
        })()
      ) : null}

      {canManage ? (
        <Modal
          open={isDepartmentModalOpen}
          onClose={() => setIsDepartmentModalOpen(false)}
          title={copy.budget.addDepartment}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsDepartmentModalOpen(false)}>
                {copy.shell.cancel}
              </Button>
              <Button type="submit" form="create-department-form" variant="primary" disabled={isSavingDepartment}>
                {isSavingDepartment ? copy.journal.saving : copy.budget.addDepartment}
              </Button>
            </>
          }
        >
          <form id="create-department-form" action={createDeptFormAction} className="space-y-4">
            <FormError message={createDeptState.error} />
            <Field label={copy.budget.departmentName}>
              <Input type="text" name="name" required />
            </Field>
          </form>
        </Modal>
      ) : null}

      {canManage ? (
        <Modal
          open={entryModalDepartment !== null}
          onClose={() => setEntryModalDepartment(null)}
          title={entryModalDepartment ? `${copy.budget.addBudgetEntry} - ${entryModalDepartment.name}` : copy.budget.addBudgetEntry}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setEntryModalDepartment(null)}>
                {copy.shell.cancel}
              </Button>
              <Button type="submit" form="create-budget-line-form" variant="primary" disabled={isSavingBudgetLine}>
                {isSavingBudgetLine ? copy.journal.saving : copy.budget.addBudgetEntry}
              </Button>
            </>
          }
        >
          <form id="create-budget-line-form" action={createLineFormAction} className="space-y-4">
            <FormError message={createLineState.error} />
            <input type="hidden" name="departmentId" value={entryModalDepartment?.id ?? ""} />

            <Field label={copy.budget.type}>
              <Select name="accountType" defaultValue="CHARGES" required>
                <option value="CHARGES">{copy.common.charges}</option>
                <option value="PRODUITS">{copy.common.produits}</option>
              </Select>
            </Field>

            <Field label={copy.budget.label}>
              <Input type="text" name="label" required />
            </Field>

            <Field label={copy.budget.amount}>
              <Input type="number" step="0.01" min="0.01" name="amount" required />
            </Field>

            <Field label={copy.budget.notesOptional}>
              <Textarea name="notes" rows={3} />
            </Field>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
