import { BoardLane, PosCellColor, type Prisma } from "@prisma/client";
import { z } from "zod";

/** The four fixed lanes, in the order the board draws them. */
export const BOARD_LANES: BoardLane[] = [BoardLane.TODO, BoardLane.IN_PROGRESS, BoardLane.AWAITING, BoardLane.DONE];

export type CardSlot = { id: string; lane: BoardLane; position: number };

/**
 * Where every card lands once `cardId` moves to `toIndex` of `toLane`.
 *
 * The client only says *which* card and *where it was dropped*; positions are
 * always recomputed here from what the database holds, dense and 0-based per
 * lane. An index past the end of the lane clamps to the end, so a stale tab
 * can't punch a hole. Returns only the rows whose lane or position changed.
 */
export function moveCard(cards: CardSlot[], cardId: string, toLane: BoardLane, toIndex: number): CardSlot[] {
  const moving = cards.find((card) => card.id === cardId);
  if (!moving) {
    throw new Error("Card not found on this board.");
  }

  const byLane = new Map<BoardLane, CardSlot[]>(BOARD_LANES.map((lane) => [lane, []]));
  for (const card of [...cards].sort((a, b) => a.position - b.position)) {
    if (card.id !== cardId) byLane.get(card.lane)!.push(card);
  }

  const target = byLane.get(toLane)!;
  const index = Math.max(0, Math.min(Math.trunc(toIndex), target.length));
  target.splice(index, 0, moving);

  const before = new Map(cards.map((card) => [card.id, card]));
  const changed: CardSlot[] = [];
  for (const [lane, laneCards] of byLane) {
    laneCards.forEach((card, position) => {
      const old = before.get(card.id)!;
      if (old.lane !== lane || old.position !== position) changed.push({ id: card.id, lane, position });
    });
  }
  return changed;
}

/** Renumbers a lane after a card left it (deleted), keeping positions dense. */
export function densifyLane(cards: CardSlot[], lane: BoardLane): CardSlot[] {
  return cards
    .filter((card) => card.lane === lane)
    .sort((a, b) => a.position - b.position)
    .flatMap((card, position) => (card.position === position ? [] : [{ id: card.id, lane, position }]));
}

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

const emptyToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

export const cardFieldsSchema = z.object({
  title: z.string().trim().min(1, "A card needs a title.").max(200, "The title is too long (200 characters max)."),
  description: z.preprocess(emptyToNull, z.string().trim().max(5000, "The description is too long.").nullable()),
  color: z.preprocess(emptyToNull, z.enum(PosCellColor, "Pick a color from the palette.").nullable()),
  deadline: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "The deadline is not a valid date.")
      .transform((value) => new Date(`${value}T00:00:00.000Z`))
      .refine((date) => !Number.isNaN(date.getTime()), "The deadline is not a valid date.")
      .nullable(),
  ),
  lane: z.enum(BoardLane, "Pick a lane."),
  userIds: z.array(z.string().min(1)).max(200),
  departmentIds: z.array(z.string().min(1)).max(200),
});

export type CardFields = z.infer<typeof cardFieldsSchema>;

/** Reads a card form. Throws the first validation message, which the form shows. */
export function parseCardForm(formData: FormData): CardFields {
  const result = cardFieldsSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    color: formData.get("color") ?? "",
    deadline: formData.get("deadline") ?? "",
    lane: formData.get("lane") ?? BoardLane.TODO,
    userIds: [...new Set(formData.getAll("userIds").map(String).filter(Boolean))],
    departmentIds: [...new Set(formData.getAll("departmentIds").map(String).filter(Boolean))],
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid card.");
  }
  return result.data;
}

export const moveCardSchema = z.object({
  cardId: z.string().min(1),
  lane: z.enum(BoardLane, "Unknown lane."),
  index: z.number().int().min(0).max(100_000),
});

// ────────────────────────────────────────────────────────────────────────────
// Copy
// ────────────────────────────────────────────────────────────────────────────

/**
 * Copies one event's board — every card with its lane, order, fields and
 * assignees — onto another event. The reusable half of "copy an event": the
 * caller owns the transaction and the permission checks.
 *
 * The target board is created if missing; copied cards are appended after
 * whatever each target lane already holds, so positions stay dense. Returns the
 * number of cards copied (0 when the source has no board).
 */
export async function copyEventBoard(
  tx: Prisma.TransactionClient,
  sourceEventId: string,
  targetEventId: string,
): Promise<number> {
  if (sourceEventId === targetEventId) {
    throw new Error("A board cannot be copied onto its own event.");
  }

  const source = await tx.eventBoard.findUnique({
    where: { eventId: sourceEventId },
    include: {
      cards: {
        orderBy: [{ lane: "asc" }, { position: "asc" }],
        include: { users: { select: { userId: true } }, departments: { select: { departmentId: true } } },
      },
    },
  });
  if (!source || source.cards.length === 0) {
    return 0;
  }

  const target = await tx.eventBoard.upsert({
    where: { eventId: targetEventId },
    create: { eventId: targetEventId },
    update: {},
    select: { id: true, cards: { select: { lane: true } } },
  });

  const nextPosition = new Map<BoardLane, number>(BOARD_LANES.map((lane) => [lane, 0]));
  for (const card of target.cards) nextPosition.set(card.lane, nextPosition.get(card.lane)! + 1);

  for (const card of [...source.cards].sort((a, b) => a.position - b.position)) {
    const position = nextPosition.get(card.lane)!;
    nextPosition.set(card.lane, position + 1);
    await tx.boardCard.create({
      data: {
        boardId: target.id,
        lane: card.lane,
        position,
        title: card.title,
        description: card.description,
        color: card.color,
        deadline: card.deadline,
        users: { create: card.users.map(({ userId }) => ({ userId })) },
        departments: { create: card.departments.map(({ departmentId }) => ({ departmentId })) },
      },
    });
  }

  return source.cards.length;
}
