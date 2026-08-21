"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
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
    cancel: string;
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

export default function CreateEventModal({ eventTypes, costCenters, editionStartDate, editionEndDate, copy }: Props) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [state, formAction, isPending] = useActionState(createEventAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, isPending, () => setOpen(false));

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

  const hasEventTypes = eventTypes.length > 0;

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <Plus />
        {copy.createEvent}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.createEvent}
        size="lg"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            {hasEventTypes ? (
              <Button
                type="submit"
                form="create-event-form"
                variant="primary"
                disabled={isPending || !!dateError}
              >
                {copy.createEvent}
              </Button>
            ) : null}
          </>
        }
      >
        {hasEventTypes ? (
          <form
            id="create-event-form"
            action={formAction}
            onSubmit={(event) => {
              if (dateError) {
                event.preventDefault();
                return;
              }
              markSubmitted();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <FormError message={state.error} className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <Field label={`${copy.eventName} *`}>
                <Input type="text" name="name" required />
              </Field>
            </div>
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
            <div className="sm:col-span-2">
              <Field label={copy.notes}>
                <Input type="text" name="notes" />
              </Field>
            </div>
            {dateError ? <FormError message={dateError} className="sm:col-span-2" /> : null}
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">{copy.noEventTypes}</p>
        )}
      </Modal>
    </>
  );
}
