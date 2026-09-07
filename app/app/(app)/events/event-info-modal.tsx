"use client";

import { useActionState, useState } from "react";
import { Info } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, IconButton, Markdown, Modal, SegmentedControl, Textarea } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import { updateEventInfoAction } from "./actions";

type Props = {
  eventId: string;
  eventName: string;
  info: string | null;
  /** Admins write; everyone else reads. A read-only edition reads too. */
  canEdit: boolean;
  copy: {
    eventInfo: string;
    eventInfoEmpty: string;
    eventInfoPlaceholder: string;
    write: string;
    preview: string;
    nothingToPreview: string;
    save: string;
    cancel: string;
  };
};

type Mode = "write" | "preview";

/**
 * An event's information page: Markdown behind the header's info button.
 *
 * One modal for both roles — the same text, written on one side and read on the
 * other — because a second screen would be the same content twice. It takes over
 * the viewport (`size="full"`, full-screen on a phone) since this is a page of
 * prose, not a field or two, and its body is what scrolls.
 */
export default function EventInfoModal({ eventId, eventName, info, canEdit, copy }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("write");
  const [draft, setDraft] = useState(info ?? "");
  const [state, formAction, isPending] = useActionState(updateEventInfoAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, isPending, () => setOpen(false));

  // Everyone reading an event that has nothing to say sees no button at all;
  // an admin always does, because writing the first line is the point.
  if (!canEdit && !info) return null;

  function openModal() {
    // The server may have revalidated since the last time this was open.
    setDraft(info ?? "");
    setMode("write");
    setOpen(true);
  }

  return (
    <>
      <IconButton
        size="md"
        tone={info ? "accent" : "neutral"}
        label={copy.eventInfo}
        onClick={openModal}
      >
        <Info />
      </IconButton>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={eventName}
        size="full"
        mobileFullScreen
        footer={
          canEdit ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {copy.cancel}
              </Button>
              <Button type="submit" form="event-info-form" variant="primary" disabled={isPending}>
                {copy.save}
              </Button>
            </>
          ) : null
        }
      >
        {canEdit ? (
          <form id="event-info-form" action={formAction} onSubmit={markSubmitted} className="space-y-3">
            <FormError message={state.error} />
            <input type="hidden" name="id" value={eventId} />

            <SegmentedControl
              options={[
                { value: "write", label: copy.write },
                { value: "preview", label: copy.preview },
              ]}
              value={mode}
              onChange={setMode}
              className="sm:w-64"
            />

            {/* The textarea stays mounted in preview so the draft — and the
                cursor — survive a look at the rendered version. */}
            <div className={mode === "write" ? undefined : "hidden"}>
              <Textarea
                name="info"
                rows={18}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={copy.eventInfoPlaceholder}
                className="font-mono"
              />
            </div>

            {mode === "preview" ? (
              draft.trim() ? (
                <Markdown source={draft} />
              ) : (
                <p className="text-sm text-[var(--muted)]">{copy.nothingToPreview}</p>
              )
            ) : null}
          </form>
        ) : info ? (
          <Markdown source={info} />
        ) : (
          <p className="text-sm text-[var(--muted)]">{copy.eventInfoEmpty}</p>
        )}
      </Modal>
    </>
  );
}
