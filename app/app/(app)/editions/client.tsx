"use client";

import { useActionState } from "react";
import type { Prisma } from "@prisma/client";
import { Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
import { Badge, Button, Card, Checkbox, Field, IconButton, Input, SectionTitle, Select } from "@/components/ui";
import { getDictionary } from "@/lib/i18n";
import { initialActionState } from "@/lib/server-action-helpers";

import {
  closeEditionAction,
  createEditionAction,
  deleteEditionAction,
  reopenEditionAction,
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
  _count: { budgets: number; moneyAccounts: number; costCenters: number; journalEntries: number };
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
  const [reopenState, reopenFormAction, isReopening] = useActionState(reopenEditionAction, initialActionState);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteEditionAction, initialActionState);
  const [createState, createFormAction, isCreating] = useActionState(createEditionAction, initialActionState);

  return (
    <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-4">
        <FormError message={updateRateState.error} />
        <FormError message={setDefaultState.error} />
        <FormError message={closeState.error} />
        <FormError message={reopenState.error} />
        <FormError message={deleteState.error} />
        {editions.map((edition) => (
          <Card key={edition.id} as="article">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <SectionTitle>{edition.name}</SectionTitle>
                  {edition.isDefault ? <Badge tone="success">{copy.editions.default}</Badge> : null}
                  {edition.closedAt ? <Badge tone="neutral">{copy.editions.closed}</Badge> : null}
                </div>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  {edition._count.budgets} {copy.editions.budgets}, {edition._count.moneyAccounts} {copy.editions.moneyAccounts}, {edition._count.costCenters} {copy.editions.costCenters}, {edition._count.journalEntries} {copy.editions.journalEntries}.
                </p>
                {edition.closedAt ? null : (
                <form action={updateRateFormAction} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="editionId" value={edition.id} />
                  <label className="text-xs font-medium text-[var(--muted)]">{copy.editions.drivingRatePerKm}</label>
                  <div className="w-24">
                    <Input
                      type="number"
                      name="drivingRatePerKm"
                      step="0.01"
                      min="0.01"
                      defaultValue={Number(edition.drivingRatePerKm).toFixed(2)}
                      size="sm"
                    />
                  </div>
                  <Button type="submit" variant="secondary" size="sm" disabled={isUpdatingRate}>
                    {copy.shell.save}
                  </Button>
                </form>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {!edition.isDefault ? (
                  <form action={setDefaultFormAction}>
                    <input type="hidden" name="editionId" value={edition.id} />
                    <Button type="submit" variant="secondary" disabled={isSettingDefault} title={copy.editions.defaultHint}>
                      {copy.editions.setAsDefault}
                    </Button>
                  </form>
                ) : null}

                {edition.closedAt ? (
                  <form action={reopenFormAction}>
                    <input type="hidden" name="editionId" value={edition.id} />
                    <Button type="submit" variant="secondary" disabled={isReopening} title={copy.editions.reopenHint}>
                      {copy.editions.reopenYear}
                    </Button>
                  </form>
                ) : (
                  <form action={closeFormAction}>
                    <input type="hidden" name="editionId" value={edition.id} />
                    <Button type="submit" variant="primary" disabled={isClosing} title={copy.editions.closeHint}>
                      {copy.editions.closeYear}
                    </Button>
                  </form>
                )}

                <form action={deleteFormAction}>
                  <input type="hidden" name="editionId" value={edition.id} />
                  <IconButton type="submit" size="md" tone="delete" label="Delete" disabled={isDeleting}>
                    <Trash2 />
                  </IconButton>
                </form>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div>
      <Card as="section">
        <SectionTitle>{copy.editions.create}</SectionTitle>
        <form action={createFormAction} className="mt-6 space-y-4">
          <FormError message={createState.error} />
          <Field label={copy.editions.editionName}>
            <Input
              type="text"
              name="name"
              placeholder="2025-2026"
              required
              pattern="\d{4}-\d{4}"
              title={copy.editions.editionNameHint}
            />
            <span className="mt-2 block text-xs text-[var(--muted)]">{copy.editions.editionNameHint}</span>
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.editions.startDate}>
              <Input type="date" name="startDate" />
            </Field>

            <Field label={copy.editions.endDate}>
              <Input type="date" name="endDate" />
            </Field>
          </div>

          <Field label={copy.editions.drivingRatePerKm}>
            <Input type="number" name="drivingRatePerKm" step="0.01" min="0.01" defaultValue="0.30" required />
          </Field>

          <Field label={copy.editions.carryOverFrom}>
            <Select name="carryOverFromId" defaultValue="">
              <option value="">{copy.editions.carryOverNone}</option>
              {editions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {edition.closedAt ? `${edition.name} — ${copy.editions.closed.toLowerCase()}` : edition.name}
                </option>
              ))}
            </Select>
            <span className="mt-2 block text-xs text-[var(--muted)]">{copy.editions.carryOverHint}</span>
          </Field>

          <div className="space-y-1">
            <Checkbox id="isDefault" name="isDefault" label={copy.editions.makeDefault} />
            <p className="text-xs text-[var(--muted)]">{copy.editions.defaultHint}</p>
          </div>

          <Button type="submit" variant="primary" disabled={isCreating}>
            {copy.editions.createButton}
          </Button>
        </form>
      </Card>
      </div>
    </section>
  );
}
