"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { requireWritableEdition } from "@/lib/edition-context";
import { type CardFields, type CardSlot, densifyLane, moveCard, moveCardSchema, parseCardForm } from "@/lib/kanban";
import { type ActionState, getRequiredString, toActionErrorMessage } from "@/lib/server-action-helpers";
import type { Prisma } from "@prisma/client";

// Same guards as every write in the events app: admin, and the event's own
// edition still open. The board is reached through its event, so every card
// action walks back up to the edition before it touches a row.

async function requireWritableEvent(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { editionId: true } });
  if (!event) throw new Error("Event not found.");
  await requireWritableEdition(event.editionId);
}

async function requireWritableCard(cardId: string) {
  const card = await prisma.boardCard.findUnique({
    where: { id: cardId },
    select: { lane: true, boardId: true, board: { select: { eventId: true, event: { select: { editionId: true } } } } },
  });
  if (!card) throw new Error("Card not found.");
  await requireWritableEdition(card.board.event.editionId);
  return { lane: card.lane, boardId: card.boardId, eventId: card.board.eventId };
}

/** Assignees the client sent, kept only if they still exist (a guest is never one). */
async function existingAssignees(fields: CardFields) {
  const [users, departments] = await Promise.all([
    fields.userIds.length
      ? prisma.user.findMany({ where: { id: { in: fields.userIds }, role: { not: "GUEST" } }, select: { id: true } })
      : [],
    fields.departmentIds.length
      ? prisma.department.findMany({ where: { id: { in: fields.departmentIds } }, select: { id: true } })
      : [],
  ]);
  return { userIds: users.map((u) => u.id), departmentIds: departments.map((d) => d.id) };
}

async function writeSlots(tx: Prisma.TransactionClient, slots: CardSlot[]) {
  for (const slot of slots) {
    await tx.boardCard.update({ where: { id: slot.id }, data: { lane: slot.lane, position: slot.position } });
  }
}

async function boardSlots(tx: Prisma.TransactionClient, boardId: string): Promise<CardSlot[]> {
  return tx.boardCard.findMany({ where: { boardId }, select: { id: true, lane: true, position: true } });
}

function boardPath(eventId: string) {
  return `/events/${eventId}/board`;
}

export async function createBoardCardAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const eventId = getRequiredString(formData, "eventId");
    await requireWritableEvent(eventId);
    const fields = parseCardForm(formData);
    const { userIds, departmentIds } = await existingAssignees(fields);

    await prisma.$transaction(async (tx) => {
      const board = await tx.eventBoard.upsert({
        where: { eventId },
        create: { eventId },
        update: {},
        select: { id: true },
      });
      // A new card goes to the end of its lane; the position is never the client's.
      const position = await tx.boardCard.count({ where: { boardId: board.id, lane: fields.lane } });
      await tx.boardCard.create({
        data: {
          boardId: board.id,
          lane: fields.lane,
          position,
          title: fields.title,
          description: fields.description,
          color: fields.color,
          deadline: fields.deadline,
          users: { create: userIds.map((userId) => ({ userId })) },
          departments: { create: departmentIds.map((departmentId) => ({ departmentId })) },
        },
      });
    });

    revalidatePath(boardPath(eventId));
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateBoardCardAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredString(formData, "id");
    const card = await requireWritableCard(id);
    const fields = parseCardForm(formData);
    const { userIds, departmentIds } = await existingAssignees(fields);

    await prisma.$transaction(async (tx) => {
      // Changing the lane from the form appends the card to the end of the new lane.
      if (fields.lane !== card.lane) {
        await writeSlots(tx, moveCard(await boardSlots(tx, card.boardId), id, fields.lane, Number.MAX_SAFE_INTEGER));
      }
      await tx.boardCard.update({
        where: { id },
        data: {
          title: fields.title,
          description: fields.description,
          color: fields.color,
          deadline: fields.deadline,
          users: { deleteMany: {}, create: userIds.map((userId) => ({ userId })) },
          departments: { deleteMany: {}, create: departmentIds.map((departmentId) => ({ departmentId })) },
        },
      });
    });

    revalidatePath(boardPath(card.eventId));
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteBoardCardAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredString(formData, "id");
    const card = await requireWritableCard(id);

    await prisma.$transaction(async (tx) => {
      await tx.boardCard.delete({ where: { id } });
      await writeSlots(tx, densifyLane(await boardSlots(tx, card.boardId), card.lane));
    });

    revalidatePath(boardPath(card.eventId));
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Drag & drop and the mobile lane picker. The client sends which card and the
 * index it was dropped at; lane and index are validated, and every position is
 * recomputed from the database (`moveCard`), never taken from the client.
 */
export async function moveBoardCardAction(input: unknown): Promise<ActionState> {
  try {
    await requireAdmin();
    const parsed = moveCardSchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid move.");
    const { cardId, lane, index } = parsed.data;
    const card = await requireWritableCard(cardId);

    await prisma.$transaction(async (tx) => {
      await writeSlots(tx, moveCard(await boardSlots(tx, card.boardId), cardId, lane, index));
    });

    revalidatePath(boardPath(card.eventId));
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
