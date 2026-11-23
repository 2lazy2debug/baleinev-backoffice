import { describe, expect, it, vi } from "vitest";

import { type CardSlot, copyEventBoard, densifyLane, moveCard, moveCardSchema, parseCardForm } from "./kanban";

const board: CardSlot[] = [
  { id: "a", lane: "TODO", position: 0 },
  { id: "b", lane: "TODO", position: 1 },
  { id: "c", lane: "TODO", position: 2 },
  { id: "d", lane: "DONE", position: 0 },
];

/** Applies moveCard's changes and returns each lane's ids in order. */
function apply(cards: CardSlot[], changes: CardSlot[]) {
  const next = new Map(cards.map((card) => [card.id, card]));
  for (const change of changes) next.set(change.id, change);
  const lanes: Record<string, string[]> = {};
  for (const card of [...next.values()].sort((x, y) => x.position - y.position)) {
    (lanes[card.lane] ??= []).push(card.id);
  }
  return lanes;
}

describe("moveCard", () => {
  it("reorders within a lane and touches only the rows that moved", () => {
    const changes = moveCard(board, "c", "TODO", 0);
    expect(apply(board, changes)).toEqual({ TODO: ["c", "a", "b"], DONE: ["d"] });
    expect(changes.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("moves across lanes and closes the gap it leaves", () => {
    const changes = moveCard(board, "a", "DONE", 1);
    expect(apply(board, changes)).toEqual({ TODO: ["b", "c"], DONE: ["d", "a"] });
    expect(changes).toContainEqual({ id: "b", lane: "TODO", position: 0 });
  });

  it("drops into an empty lane", () => {
    expect(apply(board, moveCard(board, "b", "AWAITING", 0))).toMatchObject({ AWAITING: ["b"], TODO: ["a", "c"] });
  });

  it("clamps an index past the end to the end of the lane", () => {
    const changes = moveCard(board, "a", "DONE", 99_999);
    expect(changes).toContainEqual({ id: "a", lane: "DONE", position: 1 });
  });

  it("returns nothing for a no-op move", () => {
    expect(moveCard(board, "b", "TODO", 1)).toEqual([]);
  });

  it("repairs holes and duplicate positions left by a stale state", () => {
    const messy: CardSlot[] = [
      { id: "a", lane: "TODO", position: 4 },
      { id: "b", lane: "TODO", position: 9 },
    ];
    expect(moveCard(messy, "b", "TODO", 0)).toEqual([
      { id: "b", lane: "TODO", position: 0 },
      { id: "a", lane: "TODO", position: 1 },
    ]);
  });

  it("refuses a card that is not on the board", () => {
    expect(() => moveCard(board, "zzz", "TODO", 0)).toThrow("Card not found");
  });
});

describe("densifyLane", () => {
  it("renumbers a lane after a delete", () => {
    const afterDelete = board.filter((card) => card.id !== "a");
    expect(densifyLane(afterDelete, "TODO")).toEqual([
      { id: "b", lane: "TODO", position: 0 },
      { id: "c", lane: "TODO", position: 1 },
    ]);
    expect(densifyLane(afterDelete, "DONE")).toEqual([]);
  });
});

describe("moveCardSchema", () => {
  it("rejects an unknown lane, a negative or fractional index", () => {
    expect(moveCardSchema.safeParse({ cardId: "a", lane: "BACKLOG", index: 0 }).success).toBe(false);
    expect(moveCardSchema.safeParse({ cardId: "a", lane: "TODO", index: -1 }).success).toBe(false);
    expect(moveCardSchema.safeParse({ cardId: "a", lane: "TODO", index: 1.5 }).success).toBe(false);
    expect(moveCardSchema.safeParse({ cardId: "a", lane: "TODO", index: 2 }).success).toBe(true);
  });
});

describe("parseCardForm", () => {
  function form(fields: Record<string, string | string[]>) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      for (const v of [value].flat()) fd.append(key, v);
    }
    return fd;
  }

  it("reads a full card, deduplicating assignees", () => {
    expect(
      parseCardForm(
        form({
          title: "  Order kegs ",
          description: "",
          color: "TEAL",
          deadline: "2026-12-01",
          lane: "AWAITING",
          userIds: ["u1", "u1", "u2"],
          departmentIds: ["d1"],
        }),
      ),
    ).toEqual({
      title: "Order kegs",
      description: null,
      color: "TEAL",
      deadline: new Date("2026-12-01T00:00:00.000Z"),
      lane: "AWAITING",
      userIds: ["u1", "u2"],
      departmentIds: ["d1"],
    });
  });

  it("refuses a missing title, an unknown color or lane, and a malformed date", () => {
    expect(() => parseCardForm(form({ title: " " }))).toThrow("A card needs a title.");
    expect(() => parseCardForm(form({ title: "x", color: "#ff0000" }))).toThrow("Pick a color");
    expect(() => parseCardForm(form({ title: "x", lane: "BACKLOG" }))).toThrow("Pick a lane");
    expect(() => parseCardForm(form({ title: "x", deadline: "12/01/2026" }))).toThrow("not a valid date");
  });
});

describe("copyEventBoard", () => {
  function fakeTx(source: unknown, targetLanes: string[] = []) {
    return {
      eventBoard: {
        findUnique: vi.fn().mockResolvedValue(source),
        upsert: vi.fn().mockResolvedValue({ id: "board_target", cards: targetLanes.map((lane) => ({ lane })) }),
      },
      boardCard: { create: vi.fn().mockResolvedValue({}) },
    };
  }

  const card = (id: string, lane: string, position: number) => ({
    id,
    lane,
    position,
    title: `Card ${id}`,
    description: "desc",
    color: "BLUE",
    deadline: new Date("2026-12-01"),
    users: [{ userId: "u1" }],
    departments: [{ departmentId: "d1" }],
  });

  it("refuses to copy a board onto its own event", async () => {
    await expect(copyEventBoard(fakeTx(null) as never, "e1", "e1")).rejects.toThrow("its own event");
  });

  it("does nothing when the source has no board or no cards", async () => {
    const tx = fakeTx(null);
    expect(await copyEventBoard(tx as never, "e1", "e2")).toBe(0);
    expect(tx.eventBoard.upsert).not.toHaveBeenCalled();

    const empty = fakeTx({ id: "b", cards: [] });
    expect(await copyEventBoard(empty as never, "e1", "e2")).toBe(0);
  });

  it("copies every card with its fields, lane, order and assignees", async () => {
    const tx = fakeTx({ id: "board_src", cards: [card("b", "TODO", 1), card("a", "TODO", 0), card("c", "DONE", 0)] });
    expect(await copyEventBoard(tx as never, "e1", "e2")).toBe(3);

    expect(tx.eventBoard.upsert.mock.calls[0][0]).toMatchObject({ where: { eventId: "e2" }, create: { eventId: "e2" } });
    const created = tx.boardCard.create.mock.calls.map(([arg]) => arg.data);
    expect(created.map((d) => [d.title, d.lane, d.position])).toEqual([
      ["Card a", "TODO", 0],
      ["Card c", "DONE", 0],
      ["Card b", "TODO", 1],
    ]);
    expect(created[0]).toMatchObject({
      boardId: "board_target",
      description: "desc",
      color: "BLUE",
      deadline: new Date("2026-12-01"),
      users: { create: [{ userId: "u1" }] },
      departments: { create: [{ departmentId: "d1" }] },
    });
    expect(created[0]).not.toHaveProperty("id");
  });

  it("appends after the cards the target lanes already hold", async () => {
    const tx = fakeTx({ id: "board_src", cards: [card("a", "TODO", 0)] }, ["TODO", "TODO", "DONE"]);
    await copyEventBoard(tx as never, "e1", "e2");
    expect(tx.boardCard.create.mock.calls[0][0].data).toMatchObject({ lane: "TODO", position: 2 });
  });
});
