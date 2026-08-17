"use client";

import { useActionState } from "react";
import type { Prisma } from "@prisma/client";
import { Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
import { getDictionary } from "@/lib/i18n";
import { initialActionState } from "@/lib/server-action-helpers";

import {
  closeEditionAction,
  createEditionAction,
  deleteEditionAction,
  setDefaultEditionAction,
  updateDrivingRateAction,
} from "./actions";

type Copy = ReturnType<typeof getDictionary>;

interface EditionItem {
  id: string;
  name: string;
  isDefault: boolean;
  closedAt: Date | null;
  drivingRatePerKm: Prisma.Decimal | number;
  _count: { departments: number; moneyAccounts: number; costCenters: number; journalEntries: number };
}

export function EditionsPageClient({ editions, copy }: { editions: EditionItem[]; copy: Copy }) {
  const [updateRateState, updateRateFormAction, isUpdatingRate] = useActionState(
    updateDrivingRateAction,
    initialActionState
  );
  const [setDefaultState, setDefaultFormAction, isSettingDefault] = useActionState(
    setDefaultEditionAction,
    initialActionState
  );
  const [closeState, closeFormAction, isClosing] = useActionState(closeEditionAction, initialActionState);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteEditionAction, initialActionState);
  const [createState, createFormAction, isCreating] = useActionState(createEditionAction, initialActionState);

  return (
    <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-4">
        <FormError message={updateRateState.error} />
        <FormError message={setDefaultState.error} />
        <FormError message={closeState.error} />
        <FormError message={deleteState.error} />
        {editions.map((edition) => (
          <article key={edition.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold">{edition.name}</h2>
                  {edition.isDefault ? (
                    <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                      {copy.editions.default}
                    </span>
                  ) : null}
                  {edition.closedAt ? (
                    <span className="rounded-full bg-slate-700/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                      {copy.editions.closed}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  {edition._count.departments} {copy.editions.departments}, {edition._count.moneyAccounts} {copy.editions.moneyAccounts}, {edition._count.costCenters} {copy.editions.costCenters}, {edition._count.journalEntries} {copy.editions.journalEntries}.
                </p>
                <form action={updateRateFormAction} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="editionId" value={edition.id} />
                  <label className="text-xs font-medium text-[var(--muted)]">{copy.editions.drivingRatePerKm}</label>
                  <input
                    type="number"
                    name="drivingRatePerKm"
                    step="0.01"
                    min="0.01"
                    defaultValue={Number(edition.drivingRatePerKm).toFixed(2)}
                    className="w-24 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-sm outline-none"
                  />
                  <button
                    disabled={isUpdatingRate}
                    className="rounded-md border border-[var(--line)] px-3 py-1 text-xs font-medium hover:bg-[var(--panel)] disabled:opacity-50"
                  >
                    {copy.shell.save}
                  </button>
                </form>
              </div>

              <div className="flex flex-wrap gap-2">
                {!edition.isDefault ? (
                  <form action={setDefaultFormAction}>
                    <input type="hidden" name="editionId" value={edition.id} />
                    <button
                      disabled={isSettingDefault}
                      title={copy.editions.defaultHint}
                      className="rounded-md border border-[var(--line)] px-4 py-2 text-sm font-medium hover:bg-[var(--panel)] disabled:opacity-50"
                    >
                      {copy.editions.setAsDefault}
                    </button>
                  </form>
                ) : null}

                {!edition.closedAt ? (
                  <form action={closeFormAction}>
                    <input type="hidden" name="editionId" value={edition.id} />
                    <button
                      disabled={isClosing}
                      className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-50"
                    >
                      {copy.editions.closeYear}
                    </button>
                  </form>
                ) : null}

                <form action={deleteFormAction}>
                  <input type="hidden" name="editionId" value={edition.id} />
                  <button
                    disabled={isDeleting}
                    title="Delete"
                    className="rounded-md border border-rose-300 p-2 text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
        <h2 className="text-xl font-semibold">{copy.editions.create}</h2>
        <form action={createFormAction} className="mt-6 space-y-4">
          <FormError message={createState.error} />
          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.editions.editionName}</span>
            <input
              type="text"
              name="name"
              placeholder="2025-2026"
              required
              pattern="\d{4}-\d{4}"
              title={copy.editions.editionNameHint}
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
            <span className="block text-xs text-[var(--muted)]">{copy.editions.editionNameHint}</span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.editions.startDate}</span>
              <input
                type="date"
                name="startDate"
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.editions.endDate}</span>
              <input
                type="date"
                name="endDate"
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.editions.drivingRatePerKm}</span>
            <input
              type="number"
              name="drivingRatePerKm"
              step="0.01"
              min="0.01"
              defaultValue="0.30"
              required
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <div className="space-y-1">
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" name="isDefault" className="size-4 rounded border-[var(--line)]" />
              {copy.editions.makeDefault}
            </label>
            <p className="text-xs text-[var(--muted)]">{copy.editions.defaultHint}</p>
          </div>

          <button
            disabled={isCreating}
            className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {copy.editions.createButton}
          </button>
        </form>
      </section>
    </section>
  );
}
