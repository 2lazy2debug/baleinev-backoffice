"use client";

import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Card, CardGrid, Field, IconButton, Input, Modal, Panel, SectionTitle } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { deleteEventTypeAction, updateEventTypeAction } from "../actions";

export type EventTypeRow = {
  id: string;
  name: string;
  description: string;
  /** Not editable anywhere — carried through the edit so a rename does not drop the dot's colour. */
  color: string;
  /** How many events are of this type. One is enough to make it undeletable. */
  eventCount: number;
};

type Props = {
  locale: Locale;
  eventTypes: EventTypeRow[];
};

const EDIT_FORM_ID = "edit-event-type-form";

/**
 * The event types, on a screen of their own.
 *
 * They used to be a create form and a row of chips on top of the events list —
 * configuration in the middle of the thing being configured, and the first
 * block every non-admin scrolled past. Deleting a type in use is refused by the
 * action: every event has one, so there is nowhere for the orphans to go.
 */
export function EventSettingsClient({ locale, eventTypes }: Props) {
  const copy = dictionaries[locale].events;
  const shellCopy = dictionaries[locale].shell;

  const [editing, setEditing] = useState<EventTypeRow | null>(null);

  const [editState, editFormAction, isSaving] = useActionState(updateEventTypeAction, initialActionState);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteEventTypeAction, initialActionState);
  const markEditSubmitted = useCloseOnSuccess(editState, isSaving, () => setEditing(null));

  return (
    <>
      <CardGrid>
        <Card span="1/2" className="space-y-4">
          <SectionTitle>{copy.eventTypes}</SectionTitle>
          <FormError message={deleteState.error} />

          <div className="flex flex-col gap-2">
            {eventTypes.map((eventType) => (
              <Panel key={eventType.id} nested as="div" className="flex items-center gap-2 p-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: eventType.color || "var(--accent)" }}
                    />
                    <p className="truncate text-sm font-medium">{eventType.name}</p>
                  </div>
                  <p className="truncate text-2xs text-[var(--muted)]">
                    {eventType.description ||
                      (eventType.eventCount === 0
                        ? copy.noEventFiled
                        : `${eventType.eventCount} ${copy.eventsFiled}`)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <IconButton tone="accent" label={copy.rename} onClick={() => setEditing(eventType)}>
                    <Pencil />
                  </IconButton>
                  <form action={deleteFormAction}>
                    <input type="hidden" name="id" value={eventType.id} />
                    <IconButton
                      type="submit"
                      tone="delete"
                      label={eventType.eventCount > 0 ? copy.cannotDeleteEventType : copy.deleteEventType}
                      disabled={isDeleting || eventType.eventCount > 0}
                    >
                      <Trash2 />
                    </IconButton>
                  </form>
                </div>
              </Panel>
            ))}

            {eventTypes.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{copy.eventTypesEmpty}</p>
            ) : null}
          </div>
        </Card>
      </CardGrid>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={copy.eventType}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form={EDIT_FORM_ID} variant="primary" disabled={isSaving}>
              {copy.save}
            </Button>
          </>
        }
      >
        <form id={EDIT_FORM_ID} action={editFormAction} onSubmit={markEditSubmitted} className="space-y-4">
          <FormError message={editState.error} />
          <input type="hidden" name="id" value={editing?.id ?? ""} />
          {/* The colour has no control anywhere; it still has to make the round
              trip, or saving a name would blank the dot beside it. */}
          <input type="hidden" name="color" value={editing?.color ?? ""} />
          <Field label={copy.name}>
            <Input type="text" name="name" required defaultValue={editing?.name ?? ""} key={`${editing?.id}-name`} />
          </Field>
          <Field label={copy.eventTypeDescription}>
            <Input
              type="text"
              name="description"
              defaultValue={editing?.description ?? ""}
              key={`${editing?.id}-description`}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
