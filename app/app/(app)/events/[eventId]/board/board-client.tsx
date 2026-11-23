"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardLane } from "@prisma/client";
import { CalendarClock, Pencil } from "lucide-react";

import { FormError } from "@/components/form-error";
import {
  Badge,
  Button,
  ConfirmDelete,
  Field,
  Modal,
  Panel,
  PanelHeader,
  SectionTitle,
  Select,
  cn,
  microLabelClasses,
  nestedSurfaceClasses,
} from "@/components/ui";
import { BOARD_LANES } from "@/lib/kanban";
import { tileColorStyle } from "@/lib/pos-tile-colors";
import { initialActionState } from "@/lib/server-action-helpers";

import { deleteBoardCardAction, moveBoardCardAction } from "./actions";
import { EditCardModal } from "./card-form-modal";
import { type BoardCardView, type KanbanCopy, type Option, laneLabel } from "./types";

type Lanes = Record<BoardLane, string[]>;

/** Past the end of any lane — the server clamps it to "append". */
const END_OF_LANE = 100_000;

function lanesFromCards(cards: BoardCardView[]): Lanes {
  const lanes = Object.fromEntries(BOARD_LANES.map((lane) => [lane, [] as string[]])) as Lanes;
  for (const card of [...cards].sort((a, b) => a.position - b.position)) lanes[card.lane].push(card.id);
  return lanes;
}

function isOverdue(card: BoardCardView): boolean {
  return card.lane !== "DONE" && card.deadline !== null && card.deadline < new Date().toISOString().slice(0, 10);
}

type Props = {
  cards: BoardCardView[];
  canEdit: boolean;
  users: Option[];
  departments: Option[];
  copy: KanbanCopy;
};

export default function BoardClient({ cards, canEdit, users, departments, copy }: Props) {
  const [lanes, setLanes] = useState(() => lanesFromCards(cards));
  // Re-sync with the server's order whenever a revalidation hands down new cards.
  const [syncedCards, setSyncedCards] = useState(cards);
  if (syncedCards !== cards) {
    setSyncedCards(cards);
    setLanes(lanesFromCards(cards));
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const dragStart = useRef<{ lane: BoardLane; index: number } | null>(null);

  // Mouse only: on touch the board is tap-to-open and moves go through the lane
  // picker, because dragging inside a scrolling page is unreliable.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }));

  const byId = new Map(cards.map((card) => [card.id, card]));
  const openCard = openId ? byId.get(openId) ?? null : null;
  const editingCard = editingId ? byId.get(editingId) ?? null : null;
  const activeCard = activeId ? byId.get(activeId) ?? null : null;

  function laneOf(id: string, from: Lanes = lanes): BoardLane | null {
    if ((BOARD_LANES as string[]).includes(id)) return id as BoardLane;
    return BOARD_LANES.find((lane) => from[lane].includes(id)) ?? null;
  }

  function move(cardId: string, lane: BoardLane, index: number) {
    setMoveError(null);
    startTransition(async () => {
      const result = await moveBoardCardAction({ cardId, lane, index });
      if (result.error) {
        setMoveError(result.error);
        setLanes(lanesFromCards(cards));
      }
    });
  }

  function handleDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    const lane = laneOf(id);
    setActiveId(id);
    dragStart.current = lane ? { lane, index: lanes[lane].indexOf(id) } : null;
  }

  // Crossing into another lane moves the card there right away, so the lane it
  // hovers opens a gap for it.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    setLanes((current) => {
      const from = laneOf(id, current);
      const to = laneOf(overId, current);
      if (!from || !to || from === to) return current;
      const target = current[to].filter((cardId) => cardId !== id);
      const overIndex = target.indexOf(overId);
      target.splice(overIndex === -1 ? target.length : overIndex, 0, id);
      return { ...current, [from]: current[from].filter((cardId) => cardId !== id), [to]: target };
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const start = dragStart.current;
    dragStart.current = null;
    const id = String(active.id);
    const lane = laneOf(id);
    if (!over || !lane || !start) {
      setLanes(lanesFromCards(cards));
      return;
    }

    let next = lanes;
    const overId = String(over.id);
    const oldIndex = lanes[lane].indexOf(id);
    const newIndex = laneOf(overId) === lane && overId !== lane ? lanes[lane].indexOf(overId) : oldIndex;
    if (newIndex !== oldIndex) {
      next = { ...lanes, [lane]: arrayMove(lanes[lane], oldIndex, newIndex) };
      setLanes(next);
    }

    const index = next[lane].indexOf(id);
    if (lane !== start.lane || index !== start.index) move(id, lane, index);
  }

  return (
    <>
      <FormError message={moveError} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setLanes(lanesFromCards(cards));
        }}
      >
        <div className="grid gap-4 lg:grid-cols-4 lg:items-start">
          {BOARD_LANES.map((lane) => (
            <Lane
              key={lane}
              lane={lane}
              cards={lanes[lane].flatMap((id) => byId.get(id) ?? [])}
              canEdit={canEdit}
              copy={copy}
              onOpen={setOpenId}
            />
          ))}
        </div>
        <DragOverlay>{activeCard ? <CardFace card={activeCard} dragging /> : null}</DragOverlay>
      </DndContext>

      <CardDetailModal
        card={openCard}
        canEdit={canEdit}
        copy={copy}
        onClose={() => setOpenId(null)}
        onEdit={(id) => {
          setOpenId(null);
          setEditingId(id);
        }}
        onMove={(id, lane) => move(id, lane, END_OF_LANE)}
      />
      <EditCardModal
        card={editingCard}
        onClose={() => setEditingId(null)}
        users={users}
        departments={departments}
        copy={copy}
      />
    </>
  );
}

function Lane({
  lane,
  cards,
  canEdit,
  copy,
  onOpen,
}: {
  lane: BoardLane;
  cards: BoardCardView[];
  canEdit: boolean;
  copy: KanbanCopy;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: lane, disabled: !canEdit });

  return (
    <Panel>
      <PanelHeader>
        <SectionTitle as="h2">{laneLabel(copy, lane)}</SectionTitle>
        <Badge tone="neutral">{cards.length}</Badge>
      </PanelHeader>
      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="min-h-12 space-y-2 p-2 sm:p-3">
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} canEdit={canEdit} onOpen={onOpen} />
          ))}
          {cards.length === 0 ? <li className="py-2 text-center text-xs text-[var(--muted)]">{copy.emptyLane}</li> : null}
        </ul>
      </SortableContext>
    </Panel>
  );
}

function SortableCard({
  card,
  canEdit,
  onOpen,
}: {
  card: BoardCardView;
  canEdit: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: card.id, disabled: !canEdit });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging ? "opacity-40" : null, canEdit ? "lg:cursor-grab" : null)}
      // Mouse listeners only — the button inside stays the keyboard and tap target.
      {...listeners}
    >
      <button type="button" onClick={() => onOpen(card.id)} className="block w-full text-left">
        <CardFace card={card} />
      </button>
    </li>
  );
}

/** A card on the board. Below `lg` it is the title alone; tapping opens the rest. */
function CardFace({ card, dragging = false }: { card: BoardCardView; dragging?: boolean }) {
  const assignees = [...card.departments, ...card.users];

  return (
    <div
      className={cn(nestedSurfaceClasses, "space-y-1.5 p-2", dragging ? "shadow-lg lg:cursor-grabbing" : null)}
      style={tileColorStyle(card.color)}
    >
      <p className="text-sm font-medium text-[var(--ink)]">{card.title}</p>
      <div className="hidden space-y-1.5 lg:block">
        {card.description ? <p className="line-clamp-3 text-xs text-[var(--muted)]">{card.description}</p> : null}
        {card.deadline || assignees.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {card.deadline ? (
              <Badge tone={isOverdue(card) ? "error" : "neutral"}>
                <CalendarClock className="mr-1 h-3 w-3" aria-hidden />
                {card.deadline}
              </Badge>
            ) : null}
            {assignees.map((assignee) => (
              <Badge key={assignee.id} tone="info">{assignee.name}</Badge>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CardDetailModal({
  card,
  canEdit,
  copy,
  onClose,
  onEdit,
  onMove,
}: {
  card: BoardCardView | null;
  canEdit: boolean;
  copy: KanbanCopy;
  onClose: () => void;
  onEdit: (id: string) => void;
  onMove: (id: string, lane: BoardLane) => void;
}) {
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteBoardCardAction, initialActionState);

  if (!card) return null;
  const formId = `delete-card-${card.id}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={card.title}
      size="md"
      mobileFullScreen
      footer={
        canEdit ? (
          <>
            <ConfirmDelete
              form={formId}
              trigger="button"
              label={copy.deleteCard}
              subject={card.title}
              message={copy.cannotBeUndone}
              cancelLabel={copy.cancel}
              disabled={isDeleting}
            />
            <Button type="button" variant="primary" icon={<Pencil />} onClick={() => onEdit(card.id)}>
              {copy.editCard}
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <FormError message={deleteState.error} />
        {canEdit ? (
          <>
            <form id={formId} action={deleteFormAction}>
              <input type="hidden" name="id" value={card.id} />
            </form>
            <Field label={copy.moveTo}>
              <Select value={card.lane} onChange={(event) => onMove(card.id, event.target.value as BoardLane)}>
                {BOARD_LANES.map((lane) => (
                  <option key={lane} value={lane}>{laneLabel(copy, lane)}</option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <p className={microLabelClasses}>{laneLabel(copy, card.lane)}</p>
        )}
        {card.color ? (
          <div className={cn(nestedSurfaceClasses, "h-2")} style={tileColorStyle(card.color)} aria-hidden />
        ) : null}
        {card.description ? <p className="whitespace-pre-wrap text-sm text-[var(--ink)]">{card.description}</p> : null}
        {card.deadline ? (
          <div>
            <p className={microLabelClasses}>{copy.deadline}</p>
            <p className={cn("text-sm", isOverdue(card) ? "text-[var(--bad)]" : "text-[var(--ink)]")}>
              {card.deadline}
              {isOverdue(card) ? ` · ${copy.overdue}` : null}
            </p>
          </div>
        ) : null}
        {card.users.length > 0 ? (
          <div>
            <p className={microLabelClasses}>{copy.people}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {card.users.map((user) => <Badge key={user.id} tone="info">{user.name}</Badge>)}
            </div>
          </div>
        ) : null}
        {card.departments.length > 0 ? (
          <div>
            <p className={microLabelClasses}>{copy.departments}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {card.departments.map((department) => <Badge key={department.id} tone="info">{department.name}</Badge>)}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
