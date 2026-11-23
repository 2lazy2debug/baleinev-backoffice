import { beforeEach, describe, expect, it, vi } from "vitest";

// Every board write answers to the events app's two guards — admin, and the
// event's edition still open — and never takes a position from the client.
const requireAdmin = vi.fn();
const requireWritableEdition = vi.fn();
const revalidatePath = vi.fn();
const tx = {
  eventBoard: { upsert: vi.fn() },
  boardCard: { count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
};
const prisma = {
  event: { findUnique: vi.fn() },
  boardCard: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
  department: { findMany: vi.fn() },
  $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/edition-context", () => ({
  requireWritableEdition: (...a: unknown[]) => requireWritableEdition(...a),
}));

const { createBoardCardAction, deleteBoardCardAction, moveBoardCardAction, updateBoardCardAction } = await import(
  "./actions"
);

function form(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const v of [value].flat()) fd.append(key, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "admin_1", role: "ADMIN" });
  requireWritableEdition.mockResolvedValue("edition_1");
  prisma.event.findUnique.mockResolvedValue({ editionId: "edition_1" });
  prisma.boardCard.findUnique.mockResolvedValue({
    lane: "TODO",
    boardId: "board_1",
    board: { eventId: "event_1", event: { editionId: "edition_1" } },
  });
  prisma.user.findMany.mockResolvedValue([{ id: "u1" }]);
  prisma.department.findMany.mockResolvedValue([]);
  tx.eventBoard.upsert.mockResolvedValue({ id: "board_1" });
  tx.boardCard.count.mockResolvedValue(3);
  tx.boardCard.findMany.mockResolvedValue([
    { id: "card_1", lane: "TODO", position: 0 },
    { id: "card_2", lane: "TODO", position: 1 },
  ]);
});

describe("createBoardCardAction", () => {
  it("refuses a non-admin and a closed edition", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("Unauthorized."));
    expect(await createBoardCardAction({ error: null }, form({ eventId: "event_1", title: "x" }))).toEqual({
      error: "Unauthorized.",
    });
    requireWritableEdition.mockRejectedValueOnce(new Error("This edition is closed."));
    expect(await createBoardCardAction({ error: null }, form({ eventId: "event_1", title: "x" }))).toEqual({
      error: "This edition is closed.",
    });
    expect(tx.boardCard.create).not.toHaveBeenCalled();
  });

  it("appends to the end of the lane, ignoring any position sent", async () => {
    const result = await createBoardCardAction(
      { error: null },
      form({ eventId: "event_1", title: "Order kegs", lane: "AWAITING", position: "0", userIds: ["u1", "ghost"] }),
    );
    expect(result).toEqual({ error: null });
    expect(tx.boardCard.count).toHaveBeenCalledWith({ where: { boardId: "board_1", lane: "AWAITING" } });
    expect(tx.boardCard.create.mock.calls[0][0].data).toMatchObject({
      lane: "AWAITING",
      position: 3,
      title: "Order kegs",
      users: { create: [{ userId: "u1" }] },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/events/event_1/board");
  });

  it("refuses a card without a title", async () => {
    expect(await createBoardCardAction({ error: null }, form({ eventId: "event_1", title: "" }))).toEqual({
      error: "A card needs a title.",
    });
  });
});

describe("updateBoardCardAction", () => {
  it("moves the card to the end of its new lane when the lane changes", async () => {
    await updateBoardCardAction({ error: null }, form({ id: "card_1", title: "x", lane: "DONE" }));
    expect(tx.boardCard.update).toHaveBeenCalledWith({
      where: { id: "card_1" },
      data: { lane: "DONE", position: 0 },
    });
  });
});

describe("deleteBoardCardAction", () => {
  it("closes the gap in the lane", async () => {
    tx.boardCard.findMany.mockResolvedValue([{ id: "card_2", lane: "TODO", position: 1 }]);
    await deleteBoardCardAction({ error: null }, form({ id: "card_1" }));
    expect(tx.boardCard.delete).toHaveBeenCalledWith({ where: { id: "card_1" } });
    expect(tx.boardCard.update).toHaveBeenCalledWith({ where: { id: "card_2" }, data: { lane: "TODO", position: 0 } });
  });
});

describe("moveBoardCardAction", () => {
  it("refuses an unknown lane or a bad index before touching the database", async () => {
    expect(await moveBoardCardAction({ cardId: "card_1", lane: "BACKLOG", index: 0 })).toEqual({ error: "Invalid move." });
    expect(await moveBoardCardAction({ cardId: "card_1", lane: "TODO", index: -3 })).toEqual({ error: "Invalid move." });
    expect(prisma.boardCard.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a closed edition", async () => {
    requireWritableEdition.mockRejectedValueOnce(new Error("This edition is closed."));
    expect(await moveBoardCardAction({ cardId: "card_1", lane: "DONE", index: 0 })).toEqual({
      error: "This edition is closed.",
    });
    expect(tx.boardCard.update).not.toHaveBeenCalled();
  });

  it("recomputes positions server-side", async () => {
    expect(await moveBoardCardAction({ cardId: "card_2", lane: "TODO", index: 0 })).toEqual({ error: null });
    expect(tx.boardCard.update).toHaveBeenCalledWith({ where: { id: "card_2" }, data: { lane: "TODO", position: 0 } });
    expect(tx.boardCard.update).toHaveBeenCalledWith({ where: { id: "card_1" }, data: { lane: "TODO", position: 1 } });
  });
});
