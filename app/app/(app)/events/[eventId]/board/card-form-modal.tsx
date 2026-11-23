"use client";

import { useActionState, useRef, useState } from "react";
import { BoardLane, type PosCellColor } from "@prisma/client";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal, MultiSelect, Select, Textarea, cn } from "@/components/ui";
import { BOARD_LANES } from "@/lib/kanban";
import { TILE_COLORS, tileSwatchStyle } from "@/lib/pos-tile-colors";
import { initialActionState } from "@/lib/server-action-helpers";

import { createBoardCardAction, updateBoardCardAction } from "./actions";
import { type BoardCardView, type KanbanCopy, type Option, laneLabel } from "./types";

type FieldsProps = {
  card: BoardCardView | null;
  lane: BoardLane;
  onLaneChange: (lane: BoardLane) => void;
  users: Option[];
  departments: Option[];
  copy: KanbanCopy;
};

const selectedRing = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--panel)]";

/** The card's fields. Remounted (keyed) to clear them for "Save and add another". */
function CardFields({ card, lane, onLaneChange, users, departments, copy }: FieldsProps) {
  const [color, setColor] = useState<PosCellColor | null>(card?.color ?? null);

  return (
    <>
      <div className="sm:col-span-2">
        <Field label={copy.cardTitle} required>
          <Input type="text" name="title" required maxLength={200} defaultValue={card?.title} autoFocus />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label={copy.cardDescription}>
          <Textarea name="description" rows={3} defaultValue={card?.description ?? ""} />
        </Field>
      </div>
      <Field label={copy.lane} required>
        <Select name="lane" value={lane} onChange={(event) => onLaneChange(event.target.value as BoardLane)}>
          {BOARD_LANES.map((option) => (
            <option key={option} value={option}>{laneLabel(copy, option)}</option>
          ))}
        </Select>
      </Field>
      <Field label={copy.deadline}>
        <Input type="date" name="deadline" defaultValue={card?.deadline ?? ""} />
      </Field>
      <div className="sm:col-span-2">
        <Field label={copy.color}>
          <input type="hidden" name="color" value={color ?? ""} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label={copy.colorNone}
              aria-pressed={color === null}
              onClick={() => setColor(null)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted)]",
                color === null ? selectedRing : null,
              )}
            >
              <span className="h-0.5 w-4 rotate-45 rounded-full bg-current" />
            </button>
            {TILE_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={copy.colorNames[option]}
                aria-pressed={color === option}
                onClick={() => setColor(option)}
                style={tileSwatchStyle(option)}
                className={cn("h-8 w-8 rounded-full border border-[var(--line)]", color === option ? selectedRing : null)}
              />
            ))}
          </div>
        </Field>
      </div>
      <Field label={copy.people}>
        <MultiSelect name="userIds" rows={5} defaultValue={card?.users.map((u) => u.id) ?? []}>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.name}</option>
          ))}
        </MultiSelect>
      </Field>
      <Field label={copy.departments}>
        <MultiSelect name="departmentIds" rows={5} defaultValue={card?.departments.map((d) => d.id) ?? []}>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>{department.name}</option>
          ))}
        </MultiSelect>
      </Field>
      <p className="text-xs text-[var(--muted)] sm:col-span-2">{copy.pickSeveral}</p>
    </>
  );
}

type Props = {
  eventId: string;
  users: Option[];
  departments: Option[];
  copy: KanbanCopy;
};

/** "New card": the header button and its modal, with "Save and add another". */
export default function CardFormModal({ eventId, users, departments, copy }: Props) {
  const [open, setOpen] = useState(false);
  const [lane, setLane] = useState<BoardLane>(BoardLane.TODO);
  const [formKey, setFormKey] = useState(0);
  const addAnother = useRef(false);
  const [state, formAction, isPending] = useActionState(createBoardCardAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, isPending, () => {
    if (addAnother.current) {
      // Fresh fields, same lane, modal stays open.
      setFormKey((key) => key + 1);
    } else {
      setOpen(false);
    }
  });

  return (
    <>
      <Button
        type="button"
        variant="primary"
        icon={<Plus />}
        compactOnMobile
        onClick={() => {
          setLane(BoardLane.TODO);
          setFormKey((key) => key + 1);
          setOpen(true);
        }}
      >
        {copy.addCard}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.addCard}
        size="lg"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" form="create-card-form" value="another" variant="secondary" disabled={isPending}>
              {copy.saveAndAddAnother}
            </Button>
            <Button type="submit" form="create-card-form" variant="primary" disabled={isPending}>
              {copy.save}
            </Button>
          </>
        }
      >
        <form
          id="create-card-form"
          action={formAction}
          onSubmit={(event) => {
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            addAnother.current = submitter?.getAttribute("value") === "another";
            markSubmitted();
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <input type="hidden" name="eventId" value={eventId} />
          <FormError message={state.error} className="sm:col-span-2" />
          <CardFields
            key={formKey}
            card={null}
            lane={lane}
            onLaneChange={setLane}
            users={users}
            departments={departments}
            copy={copy}
          />
        </form>
      </Modal>
    </>
  );
}

type EditProps = {
  card: BoardCardView | null;
  onClose: () => void;
  users: Option[];
  departments: Option[];
  copy: KanbanCopy;
};

/** Edits one card. Open while `card` is set; mounted per card so its fields start from it. */
export function EditCardModal({ card, onClose, users, departments, copy }: EditProps) {
  return card ? (
    <EditCardDialog key={card.id} card={card} onClose={onClose} users={users} departments={departments} copy={copy} />
  ) : null;
}

function EditCardDialog({ card, onClose, users, departments, copy }: EditProps & { card: BoardCardView }) {
  const [lane, setLane] = useState<BoardLane>(card.lane);
  const [state, formAction, isPending] = useActionState(updateBoardCardAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, isPending, onClose);
  const formId = `edit-card-${card.id}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.editCard}
      size="lg"
      mobileFullScreen
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={isPending}>
            {copy.save}
          </Button>
        </>
      }
    >
      <form id={formId} action={formAction} onSubmit={markSubmitted} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={card.id} />
        <FormError message={state.error} className="sm:col-span-2" />
        <CardFields card={card} lane={lane} onLaneChange={setLane} users={users} departments={departments} copy={copy} />
      </form>
    </Modal>
  );
}
