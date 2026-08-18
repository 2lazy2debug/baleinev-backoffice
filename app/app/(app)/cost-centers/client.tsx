"use client";

import { useActionState } from "react";
import { Pencil, TrendingDown, TrendingUp, Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

import { createCostCenterAction, deleteCostCenterAction, updateCostCenterNameAction } from "./actions";

type CostCenterItem = {
  id: string;
  code: string;
  name: string;
  journalEntriesCount: number;
  charges: number;
  produits: number;
  canDelete: boolean;
};

type Props = {
  locale: Locale;
  costCenters: CostCenterItem[];
};

export function CostCentersPageClient({ locale, costCenters }: Props) {
  const copy = dictionaries[locale];
  const [updateState, updateFormAction, isSavingCostCenter] = useActionState(
    updateCostCenterNameAction,
    initialActionState
  );
  const [deleteState, deleteFormAction, isDeletingCostCenter] = useActionState(
    deleteCostCenterAction,
    initialActionState
  );
  const isReadOnly = useEditionReadOnly();
  const [createState, createFormAction, isCreatingCostCenter] = useActionState(
    createCostCenterAction,
    initialActionState
  );

  return (
    <section className={isReadOnly ? "grid gap-6" : "grid gap-6 xl:grid-cols-[1fr_360px]"}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormError message={updateState.error} className="md:col-span-2" />
        <FormError message={deleteState.error} className="md:col-span-2" />
        {costCenters.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)] md:col-span-2">
            {copy.costCenters.noCostCenters}
          </div>
        ) : (
          costCenters.map((costCenter) => {
            const result = costCenter.produits - costCenter.charges;

            return (
              <article key={costCenter.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{costCenter.code}</p>
                    <h2 className="mt-2 text-lg font-semibold">{costCenter.name}</h2>
                    <p className="mt-3 text-sm text-[var(--muted)]">
                      {costCenter.journalEntriesCount} {copy.costCenters.journalEntries}
                    </p>
                    <div className="mt-4 space-y-1 text-sm">
                      <p>{copy.common.charges}: <span className="font-semibold whitespace-nowrap">{formatCurrency(costCenter.charges)}</span></p>
                      <p>{copy.common.produits}: <span className="font-semibold whitespace-nowrap">{formatCurrency(costCenter.produits)}</span></p>
                      <div className="flex flex-nowrap items-center gap-1.5">
                        <span>{copy.common.result}:</span>
                        <span className={`font-semibold whitespace-nowrap ${result >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatCurrency(result)}</span>
                        {result >= 0
                          ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                          : <TrendingDown className="h-4 w-4 text-rose-400" />}
                      </div>
                    </div>
                  </div>

                  {isReadOnly ? null : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-end gap-2">
                      <details className="group">
                        <summary className="list-none cursor-pointer rounded-md border border-[var(--line)] p-2 text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)]">
                          <Pencil className="h-3.5 w-3.5" />
                        </summary>
                        <form action={updateFormAction} className="mt-3 flex items-center gap-2">
                          <input type="hidden" name="costCenterId" value={costCenter.id} />
                          <input
                            type="text"
                            name="name"
                            defaultValue={costCenter.name}
                            required
                            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                          />
                          <button
                            disabled={isSavingCostCenter}
                            className="rounded-md border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)] disabled:opacity-60"
                          >
                            {copy.shell.save}
                          </button>
                        </form>
                      </details>

                      <form action={deleteFormAction}>
                        <input type="hidden" name="costCenterId" value={costCenter.id} />
                        <button
                          disabled={!costCenter.canDelete || isDeletingCostCenter}
                          title={costCenter.canDelete ? copy.budget.deleteDepartment : copy.costCenters.cannotDelete}
                          className="rounded-md border border-rose-300 p-2 text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)] disabled:hover:bg-transparent"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                  </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {isReadOnly ? null : (
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
        <h2 className="text-xl font-semibold">{copy.costCenters.create}</h2>
        <form action={createFormAction} className="mt-6 space-y-4">
          <FormError message={createState.error} />
          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.costCenters.code}</span>
            <input
              type="text"
              name="code"
              placeholder="AFTER"
              required
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.costCenters.name}</span>
            <input
              type="text"
              name="name"
              placeholder="After party"
              required
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <button
            disabled={isCreatingCostCenter}
            className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {copy.costCenters.add}
          </button>
        </form>
      </section>
      )}
    </section>
  );
}
