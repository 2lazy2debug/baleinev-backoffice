"use client";

import { useActionState } from "react";
import { Pencil, TrendingDown, TrendingUp, Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { Button, Card, CardGrid, IconButton, Input, SectionTitle, iconButtonClasses } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

import { deleteCostCenterAction, updateCostCenterNameAction } from "./actions";

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

  return (
    <section className="space-y-4">
      <FormError message={updateState.error} />
      <FormError message={deleteState.error} />
      <CardGrid>
        {costCenters.length === 0 ? (
          <Card span="full" dashed>
            {copy.costCenters.noCostCenters}
          </Card>
        ) : (
          costCenters.map((costCenter) => {
            const result = costCenter.produits - costCenter.charges;

            return (
              <Card key={costCenter.id} as="article" span="1/2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{costCenter.code}</p>
                    <SectionTitle className="mt-2">{costCenter.name}</SectionTitle>
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
                        <summary className={iconButtonClasses("neutral", "sm", "list-none cursor-pointer")}>
                          <Pencil />
                        </summary>
                        <form action={updateFormAction} className="mt-3 flex items-center gap-2">
                          <input type="hidden" name="costCenterId" value={costCenter.id} />
                          <Input type="text" name="name" defaultValue={costCenter.name} required size="sm" />
                          <Button type="submit" variant="secondary" size="sm" disabled={isSavingCostCenter}>
                            {copy.shell.save}
                          </Button>
                        </form>
                      </details>

                      <form action={deleteFormAction}>
                        <input type="hidden" name="costCenterId" value={costCenter.id} />
                        <IconButton
                          type="submit"
                          tone="delete"
                          label={costCenter.canDelete ? copy.costCenters.delete : copy.costCenters.cannotDelete}
                          disabled={!costCenter.canDelete || isDeletingCostCenter}
                        >
                          <Trash2 />
                        </IconButton>
                      </form>
                    </div>
                  </div>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </CardGrid>
    </section>
  );
}
