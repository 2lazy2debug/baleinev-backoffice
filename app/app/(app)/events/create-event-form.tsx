"use client";

import { useActionState, useMemo, useState } from "react";

import { FormError } from "@/components/form-error";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import { createEventAction } from "./actions";

type EventTypeItem = {
  id: string;
  name: string;
};

type CostCenterItem = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  eventTypes: EventTypeItem[];
  costCenters: CostCenterItem[];
  editionStartDate: string | null;
  editionEndDate: string | null;
  copy: {
    createEvent: string;
    noEventTypes: string;
    eventName: string;
    eventType: string;
    costCenter: string;
    startDate: string;
    endDate: string;
    notes: string;
    dateOrderError: string;
    dateOutOfEditionRange: string;
  };
};

export default function CreateEventForm({ eventTypes, costCenters, editionStartDate, editionEndDate, copy }: Props) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [state, formAction, isPending] = useActionState(createEventAction, initialActionState);

  // "Advanced" validation: both fields hold individually well-formed dates,
  // the problem only shows up once they're compared against each other (or
  // against the edition). Surfaced inline as the user picks dates, not as a
  // native required/type tooltip.
  const dateError = useMemo(() => {
    if (!startDate || !endDate) return null;
    if (endDate < startDate) return copy.dateOrderError;
    if (editionStartDate && startDate < editionStartDate) return dateOutOfRangeMessage();
    if (editionEndDate && endDate > editionEndDate) return dateOutOfRangeMessage();
    return null;

    function dateOutOfRangeMessage() {
      const start = editionStartDate ?? "…";
      const end = editionEndDate ?? "…";
      return `${copy.dateOutOfEditionRange} (${start} – ${end}).`;
    }
  }, [copy.dateOrderError, copy.dateOutOfEditionRange, editionEndDate, editionStartDate, endDate, startDate]);

  return (
    <Card as="section" className="space-y-4">
      <h2 className="text-lg font-semibold">{copy.createEvent}</h2>
      {eventTypes.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{copy.noEventTypes}</p>
      ) : (
        <form
          action={formAction}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            if (dateError) event.preventDefault();
          }}
        >
          <FormError message={state.error} className="sm:col-span-2 lg:col-span-3" />
          <Field label={`${copy.eventName} *`}>
            <Input type="text" name="name" required />
          </Field>
          <Field label={`${copy.eventType} *`}>
            <Select name="eventTypeId" required defaultValue="">
              <option value="" disabled>{copy.eventType}</option>
              {eventTypes.map((et) => (
                <option key={et.id} value={et.id}>{et.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={copy.costCenter}>
            <Select name="costCenterId" defaultValue="">
              <option value="">—</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.code} {cc.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={`${copy.startDate} *`}>
            <Input
              type="date"
              name="startDate"
              required
              min={editionStartDate ?? undefined}
              max={editionEndDate ?? undefined}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          <Field label={`${copy.endDate} *`}>
            <Input
              type="date"
              name="endDate"
              required
              min={editionStartDate ?? undefined}
              max={editionEndDate ?? undefined}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
          <Field label={copy.notes}>
            <Input type="text" name="notes" />
          </Field>
          {dateError ? <FormError message={dateError} className="sm:col-span-2 lg:col-span-3" /> : null}
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" variant="primary" disabled={isPending || !!dateError}>
              {copy.createEvent}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
