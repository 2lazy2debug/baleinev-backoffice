import { AccountType } from "@prisma/client";
import { Pencil, TrendingDown, TrendingUp, Trash2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber, formatCurrency } from "@/lib/utils";

import { createCostCenterAction, deleteCostCenterAction, updateCostCenterNameAction } from "./actions";

export default async function CostCentersPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const activeEdition = await prisma.edition.findFirst({
    where: { isActive: true },
    include: {
      costCenters: {
        orderBy: { code: "asc" },
        include: {
          _count: { select: { journalEntries: true } },
          journalEntries: true,
        },
      },
    },
  });

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.costCenters.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noActiveEdition}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
          {copy.common.createAndActivateEdition}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.costCenters.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.costCenters.forEdition} {activeEdition.name}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">
          {copy.costCenters.subtitle}
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4 md:grid-cols-2">
          {activeEdition.costCenters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)] md:col-span-2">
              {copy.costCenters.noCostCenters}
            </div>
          ) : (
            activeEdition.costCenters.map((costCenter) => {
              const charges = costCenter.journalEntries.reduce((total, entry) => {
                return entry.accountType === AccountType.CHARGES
                  ? total + decimalToNumber(entry.amount)
                  : total;
              }, 0);
              const produits = costCenter.journalEntries.reduce((total, entry) => {
                return entry.accountType === AccountType.PRODUITS
                  ? total + decimalToNumber(entry.amount)
                  : total;
              }, 0);

              return (
                <article key={costCenter.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{costCenter.code}</p>
                      <h2 className="mt-2 text-lg font-semibold">{costCenter.name}</h2>
                      <p className="mt-3 text-sm text-[var(--muted)]">
                        {costCenter.journalEntries.length} {copy.costCenters.journalEntries}
                      </p>
                      <div className="mt-4 space-y-1 text-sm">
                        <p>{copy.common.charges}: <span className="font-semibold whitespace-nowrap">{formatCurrency(charges)}</span></p>
                        <p>{copy.common.produits}: <span className="font-semibold whitespace-nowrap">{formatCurrency(produits)}</span></p>
                        <div className="flex flex-nowrap items-center gap-1.5">
                          <span>{copy.common.result}:</span>
                          <span className={`font-semibold whitespace-nowrap ${produits - charges >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatCurrency(produits - charges)}</span>
                          {produits - charges >= 0
                            ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                            : <TrendingDown className="h-4 w-4 text-rose-400" />}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-end gap-2">
                        <details className="group">
                          <summary className="list-none cursor-pointer rounded-md border border-[var(--line)] p-2 text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)]">
                            <Pencil className="h-3.5 w-3.5" />
                          </summary>
                          <form action={updateCostCenterNameAction} className="mt-3 flex items-center gap-2">
                            <input type="hidden" name="costCenterId" value={costCenter.id} />
                            <input
                              type="text"
                              name="name"
                              defaultValue={costCenter.name}
                              required
                              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                            />
                            <button className="rounded-md border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)]">
                              {copy.shell.save}
                            </button>
                          </form>
                        </details>

                        <form action={deleteCostCenterAction}>
                          <input type="hidden" name="costCenterId" value={costCenter.id} />
                          <button
                            disabled={costCenter._count.journalEntries > 0}
                            title={costCenter._count.journalEntries > 0 ? copy.costCenters.cannotDelete : copy.budget.deleteDepartment}
                            className="rounded-md border border-rose-300 p-2 text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)] disabled:hover:bg-transparent"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
          <h2 className="text-xl font-semibold">{copy.costCenters.create}</h2>
          <form action={createCostCenterAction} className="mt-6 space-y-4">
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

            <button className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
              {copy.costCenters.add}
            </button>
          </form>
        </section>
      </section>
    </div>
  );
}
