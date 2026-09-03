"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Pencil, Plus, TrendingDown, TrendingUp, Trash2, X } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import {
  Button,
  Card,
  CardGrid,
  Cardlet,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  SectionTitle,
  Select,
  TD,
  TFoot,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  cn,
  nestedSurfaceClasses,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState, toActionErrorMessage } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

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

/**
 * One account type of a department: its budget lines, its journal entries, and
 * the two totals every view of this screen compares.
 *
 * `actualTotal` is a section-level fact and cannot be anything finer: a journal
 * entry carries a department and a CHARGES/PRODUITS type, never a budget line
 * (see `JournalEntry` in prisma/schema.prisma), which is also how the dashboard
 * computes budget vs. actuals. That is why the phone's progress bar sits on the
 * section and not on the line.
 */
type AccountSection = {
  accountType: BudgetLineItem["accountType"];
  title: string;
  emptyMessage: string;
  lines: BudgetLineItem[];
  budgetTotal: number;
  actualTotal: number;
};

/** Everything a department needs, summed once for the table, the cards and the modal. */
type DepartmentSummary = {
  department: DepartmentItem;
  sections: [AccountSection, AccountSection];
  charges: AccountSection;
  produits: AccountSection;
  budgetResult: number;
  actualResult: number;
  chargesAvailability: number;
};

function sumAmounts(rows: Array<{ amount: number }>) {
  return rows.reduce((total, row) => total + row.amount, 0);
}

const rollupTones = {
  neutral: { fill: "bg-[var(--accent)]", gap: "text-[var(--muted)]", actual: undefined },
  good: { fill: "bg-emerald-400", gap: "text-emerald-300", actual: "text-emerald-300" },
  bad: { fill: "bg-rose-400", gap: "text-rose-300", actual: "text-rose-300" },
} as const;

type BudgetRollupProps = {
  budgetedLabel: string;
  actualLabel: string;
  budgeted: number;
  actual: number;
  /** The gap, already worded — "Available CHF 3,770.00", "Overexpense CHF 450.00". */
  gap: string;
  tone: keyof typeof rollupTones;
};

/**
 * Planned vs. actual for one account type. It stands in for the table footer on a
 * phone, where a single budgeted total is the one number a department user cannot
 * act on — what they came for is how much is left.
 */
function BudgetRollup({ budgetedLabel, actualLabel, budgeted, actual, gap, tone }: BudgetRollupProps) {
  const { fill, gap: gapClass, actual: actualClass } = rollupTones[tone];
  const percent = budgeted > 0
    ? Math.min(100, Math.round((actual / budgeted) * 100))
    : actual > 0 ? 100 : 0;

  return (
    <div className={cn(nestedSurfaceClasses, "space-y-2 p-2 sm:p-3")}>
      <CardletFields>
        <CardletField label={budgetedLabel}>
          <span className="text-sm font-semibold">{formatCurrency(budgeted)}</span>
        </CardletField>
        <CardletField label={actualLabel}>
          <span className={cn("text-sm font-semibold", actualClass)}>{formatCurrency(actual)}</span>
        </CardletField>
      </CardletFields>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={gap}
        className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-strong)]"
      >
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${percent}%` }} />
      </div>
      <p className={cn("text-xs", gapClass)}>{gap}</p>
    </div>
  );
}

export default function BudgetPageClient({ locale, editionName, departments, canManage: canManageProp, emptyStateMessage }: BudgetPageClientProps) {
  const isReadOnly = useEditionReadOnly();
  // A closed edition is read-only, so it takes the same path as "not allowed to manage".
  const canManage = canManageProp && !isReadOnly;
  const copy = dictionaries[locale];
  const router = useRouter();

  const [entryModalDepartment, setEntryModalDepartment] = useState<{ id: string; name: string } | null>(null);
  const [editingBudgetLineId, setEditingBudgetLineId] = useState<string | null>(null);
  const [editBudgetDraft, setEditBudgetDraft] = useState<{ label: string; amount: string; notes: string } | null>(null);
  const [detailsDepartmentId, setDetailsDepartmentId] = useState<string | null>(null);

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

  const summaries = useMemo<DepartmentSummary[]>(() => departments.map((department) => {
    function buildSection(accountType: AccountSection["accountType"], title: string, emptyMessage: string): AccountSection {
      const lines = department.budgetLines.filter((line) => line.accountType === accountType);
      const journalEntries = department.journalEntries.filter((entry) => entry.accountType === accountType);
      return { accountType, title, emptyMessage, lines, budgetTotal: sumAmounts(lines), actualTotal: sumAmounts(journalEntries) };
    }

    const charges = buildSection("CHARGES", copy.common.charges, copy.budget.noSpendingEntries);
    const produits = buildSection("PRODUITS", copy.common.produits, copy.budget.noEarningsEntries);

    return {
      department,
      sections: [charges, produits],
      charges,
      produits,
      budgetResult: produits.budgetTotal - charges.budgetTotal,
      actualResult: produits.actualTotal - charges.actualTotal,
      chargesAvailability: charges.budgetTotal - charges.actualTotal,
    };
  }), [departments, copy]);

  const detailsSummary = summaries.find((summary) => summary.department.id === detailsDepartmentId) ?? null;

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.budget.title}
        title={<>{copy.budget.entriesFor} {editionName}</>}
        description={copy.budget.subtitle}
      />

      <div className="space-y-4">
        <FormError message={deleteLineState.error} />
        <FormError message={saveLineState.error} />
        {departments.length === 0 ? (
          <CardGrid>
            <Card span="full" dashed>{emptyStateMessage}</Card>
          </CardGrid>
        ) : (
          <CardGrid>
            {summaries.map((summary) => {
              const { department } = summary;

              return (
                <Card key={department.id} as="article" span="1/2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <SectionTitle>{department.name}</SectionTitle>
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        {department.budgetLines.length} {copy.budget.budgetEntries}
                      </p>
                      {department.budgetLines.length > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                          <span className={summary.budgetResult >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatCurrency(summary.budgetResult)}</span>
                          {summary.budgetResult >= 0
                            ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                            : <TrendingDown className="h-4 w-4 text-rose-400" />}
                        </div>
                      )}
                    </div>
                    {/* Budget management stays desktop-only in this pass: a phone gets the
                        read-only roll-up below, and the details modal behind the eye is
                        three wide tables that do not fit one. */}
                    <div className="hidden items-center gap-2 sm:flex">
                      <IconButton tone="neutral" label={copy.budget.viewDetails} onClick={() => setDetailsDepartmentId(department.id)}>
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
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    {summary.sections.map((section) => {
                      const gap = section.budgetTotal - section.actualTotal;
                      const isCharges = section.accountType === "CHARGES";
                      // The two account types read the gap in opposite directions: money
                      // left to spend is good news, money left to earn is not.
                      const overshot = isCharges ? gap < 0 : gap <= 0;
                      const gapLabel = isCharges
                        ? (overshot ? copy.budget.overexpense : copy.budget.available)
                        : (overshot ? copy.budget.aboveTarget : copy.budget.stillToEarn);

                      return (
                        <section key={section.accountType}>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{section.title}</p>
                          <Table desktopOnly>
                            <THead>
                              <TR>
                                <TH>{copy.budget.label}</TH>
                                <TH>{copy.budget.notes}</TH>
                                <TH className="text-right">{copy.budget.amount}</TH>
                                <TH></TH>
                              </TR>
                            </THead>
                            <tbody>
                              {section.lines.length === 0 ? (
                                <TR>
                                  <TD colSpan={4} className="text-xs text-[var(--muted)]">{section.emptyMessage}</TD>
                                </TR>
                              ) : (
                                section.lines.map((line) => {
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
                            {section.lines.length > 0 && (
                              <TFoot>
                                <TR>
                                  <TD colSpan={2} className="text-xs font-semibold text-[var(--muted)]">{copy.common.total}</TD>
                                  <TD className="text-right font-semibold">{formatCurrency(section.budgetTotal)}</TD>
                                  <TD></TD>
                                </TR>
                              </TFoot>
                            )}
                          </Table>

                          {/* Below `sm` the four-column table becomes the read-only view the
                              handoff asks for: the section roll-up, then one cardlet per
                              line. Both read the same section object as the table above. */}
                          <div className="space-y-3 sm:hidden">
                            {section.lines.length === 0 && section.actualTotal === 0 ? (
                              <p className="text-xs text-[var(--muted)]">{section.emptyMessage}</p>
                            ) : (
                              <BudgetRollup
                                budgetedLabel={copy.budget.budgeted}
                                actualLabel={copy.budget.actual}
                                budgeted={section.budgetTotal}
                                actual={section.actualTotal}
                                gap={`${gapLabel} ${formatCurrency(Math.abs(gap))}`}
                                tone={overshot ? (isCharges ? "bad" : "good") : "neutral"}
                              />
                            )}
                            <CardletList>
                              {section.lines.map((line) => (
                                <Cardlet key={line.id}>
                                  {/* No account-type badge here: these cards sit under the
                                      section heading that already names the type, and the
                                      table row they stand in for has no such column either. */}
                                  <CardletHeader
                                    title={line.label}
                                    action={<span className="shrink-0 text-sm font-semibold">{formatCurrency(line.amount)}</span>}
                                  />
                                  {line.notes ? (
                                    <CardletFields>
                                      <CardletField label={copy.budget.notes} className="col-span-2">{line.notes}</CardletField>
                                    </CardletFields>
                                  ) : null}
                                </Cardlet>
                              ))}
                            </CardletList>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </CardGrid>
        )}
      </div>

      {detailsSummary ? (
        <Modal
          open
          onClose={() => setDetailsDepartmentId(null)}
          title={`${copy.budget.detailsTitle} - ${detailsSummary.department.name}`}
          size="full"
        >
          <Card as="div" className="mb-5 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{copy.budget.chargesAvailability}</p>
              <p className={`text-sm font-semibold ${detailsSummary.chargesAvailability >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {detailsSummary.chargesAvailability >= 0 ? copy.budget.available : copy.budget.overexpense} {formatCurrency(Math.abs(detailsSummary.chargesAvailability))}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{copy.budget.budgetResult}</p>
              <p className="text-sm font-semibold">{formatCurrency(detailsSummary.budgetResult)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{copy.budget.actualResult}</p>
              <p className="text-sm font-semibold">{formatCurrency(detailsSummary.actualResult)}</p>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-5 lg:max-h-[62vh] lg:overflow-y-auto lg:pr-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.budget.budgetEntries}</p>
              {detailsSummary.sections.map((section) => (
                <section key={section.accountType} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{section.title}</p>
                  <Table>
                    <THead>
                      <TR>
                        <TH>{copy.budget.label}</TH>
                        <TH>{copy.budget.notes}</TH>
                        <TH className="text-right">{copy.budget.amount}</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {section.lines.length === 0 ? (
                        <TR>
                          <TD colSpan={3} className="text-xs text-[var(--muted)]">{section.emptyMessage}</TD>
                        </TR>
                      ) : (
                        section.lines.map((line) => (
                          <TR key={`${section.accountType}-${line.id}`}>
                            <TD className="font-medium">{line.label}</TD>
                            <TD className="text-xs text-[var(--muted)]">{line.notes ?? "-"}</TD>
                            <TD className="text-right font-semibold">{formatCurrency(line.amount)}</TD>
                          </TR>
                        ))
                      )}
                    </tbody>
                    {section.lines.length > 0 ? (
                      <TFoot>
                        <TR>
                          <TD colSpan={2} className="text-xs font-semibold text-[var(--muted)]">{copy.common.total}</TD>
                          <TD className="text-right font-semibold">{formatCurrency(section.budgetTotal)}</TD>
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
                  <p className="text-sm font-semibold text-rose-300">{formatCurrency(detailsSummary.charges.actualTotal)}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-[0.14em] text-[var(--muted)]">{copy.common.produits}</p>
                  <p className="text-sm font-semibold text-emerald-300">{formatCurrency(detailsSummary.produits.actualTotal)}</p>
                </div>
              </Card>
              <Table>
                <THead>
                  <TR>
                    <TH>{copy.journal.date}</TH>
                    <TH>{copy.journal.type}</TH>
                    <TH>{copy.budget.label}</TH>
                    <TH>{copy.journal.counterpart}</TH>
                    <TH>{copy.journal.reference}</TH>
                    <TH className="text-right">{copy.budget.amount}</TH>
                  </TR>
                </THead>
                <tbody>
                  {detailsSummary.department.journalEntries.length === 0 ? (
                    <TR>
                      <TD colSpan={6} className="text-xs text-[var(--muted)]">{copy.budget.noJournalEntries}</TD>
                    </TR>
                  ) : (
                    detailsSummary.department.journalEntries.map((entry) => (
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
