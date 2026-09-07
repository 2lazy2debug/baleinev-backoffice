import { beforeEach, describe, expect, it, vi } from "vitest";

// `removeFromPlace` is what the POS calls once per sold line, inside its own
// sale transaction. It never refuses: it drains the dated rows oldest first and
// writes whatever the shelf could not cover as a negative undated row, because a
// sale that happened is a fact and a count that disagrees is the thing to fix.
//
// `applyMovement` is the clamp either side of that: counting by hand stops at
// zero, selling does not.
//
// Nothing is mocked: the helpers take the caller's transaction client, so a fake
// one is the whole fixture.
import { applyMovement, removeFromPlace } from "./stock-movements";

/** A fake transaction client that keeps each row's quantity in step with the writes. */
function txWithRows(rows: Array<{ id: string; expireDate: Date | null; quantity: number }>) {
  const state = rows.map((row) => ({ stockPlaceId: "place_1", elementId: "el_1", ...row }));
  let created = 0;
  return {
    state,
    stockItem: {
      findMany: vi.fn(async () => state.filter((row) => row.quantity > 0)),
      // Only ever asked for the undated row, which is how the shortfall lands.
      findFirst: vi.fn(async () => state.find((row) => row.expireDate === null) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { quantity: number } }) => {
        const row = state.find((r) => r.id === where.id)!;
        row.quantity = data.quantity;
      }),
      create: vi.fn(async ({ data }: { data: { expireDate: Date | null; quantity: number } }) => {
        const row = { stockPlaceId: "place_1", elementId: "el_1", id: `new_${++created}`, ...data };
        state.push(row);
        return row;
      }),
    },
    stockMovement: { create: vi.fn() },
  };
}

const D = (iso: string) => new Date(iso);

/** The last movement written, as the history would read it. */
function lastMovement(tx: ReturnType<typeof txWithRows>) {
  const calls = tx.stockMovement.create.mock.calls;
  return calls[calls.length - 1][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("removeFromPlace", () => {
  it("reads only rows with stock left, oldest expiry first and undated last", async () => {
    const tx = txWithRows([{ id: "a", expireDate: D("2026-01-01"), quantity: 10 }]);
    await removeFromPlace(tx as never, { stockPlaceId: "place_1", elementId: "el_1" }, 3, "u_1");

    expect(tx.stockItem.findMany).toHaveBeenCalledWith({
      where: { stockPlaceId: "place_1", elementId: "el_1", quantity: { gt: 0 } },
      orderBy: { expireDate: { sort: "asc", nulls: "last" } },
    });
  });

  it("takes the whole quantity off one shelf and returns it", async () => {
    const tx = txWithRows([{ id: "a", expireDate: null, quantity: 10 }]);
    const taken = await removeFromPlace(tx as never, { stockPlaceId: "place_1", elementId: "el_1" }, 3, "u_1");

    expect(taken).toBe(3);
    expect(tx.state[0].quantity).toBe(7);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create.mock.calls[0][0].data).toMatchObject({ delta: 3, isIn: false, createdById: "u_1" });
  });

  it("empties the earlier-dated row before dipping into the next", async () => {
    const tx = txWithRows([
      { id: "early", expireDate: D("2026-01-01"), quantity: 4 },
      { id: "late", expireDate: D("2026-06-01"), quantity: 10 },
    ]);
    const taken = await removeFromPlace(tx as never, { stockPlaceId: "place_1", elementId: "el_1" }, 6, "u_1");

    expect(taken).toBe(6);
    expect(tx.state.find((r) => r.id === "early")!.quantity).toBe(0);
    expect(tx.state.find((r) => r.id === "late")!.quantity).toBe(8);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
  });

  it("puts what the dated shelf could not cover on a new negative undated row", async () => {
    const tx = txWithRows([{ id: "a", expireDate: D("2026-01-01"), quantity: 2 }]);
    const taken = await removeFromPlace(tx as never, { stockPlaceId: "place_1", elementId: "el_1" }, 5, "u_1");

    // The shelf held 2; the other 3 are the shortfall, and they are recorded.
    expect(taken).toBe(2);
    expect(tx.state.find((r) => r.id === "a")!.quantity).toBe(0);
    expect(tx.state.find((r) => r.expireDate === null)!.quantity).toBe(-3);
    expect(lastMovement(tx)).toMatchObject({ delta: 3, isIn: false, expireDate: null, createdById: "u_1" });
  });

  it("takes an empty shelf straight below zero rather than writing nothing", async () => {
    const tx = txWithRows([]);
    const taken = await removeFromPlace(tx as never, { stockPlaceId: "place_1", elementId: "el_1" }, 3, "u_1");

    expect(taken).toBe(0);
    expect(tx.stockItem.create).toHaveBeenCalledTimes(1);
    expect(tx.state[0].quantity).toBe(-3);
    expect(lastMovement(tx)).toMatchObject({ delta: 3, isIn: false });
  });

  it("drives an already-negative undated row further down", async () => {
    const tx = txWithRows([{ id: "owed", expireDate: null, quantity: -2 }]);
    const taken = await removeFromPlace(tx as never, { stockPlaceId: "place_1", elementId: "el_1" }, 4, "u_1");

    expect(taken).toBe(0);
    expect(tx.stockItem.create).not.toHaveBeenCalled();
    expect(tx.state[0].quantity).toBe(-6);
  });

  it("drains the undated row it has, then owes the rest on the same row", async () => {
    const tx = txWithRows([{ id: "a", expireDate: null, quantity: 1 }]);
    const taken = await removeFromPlace(tx as never, { stockPlaceId: "place_1", elementId: "el_1" }, 4, "u_1");

    expect(taken).toBe(1);
    expect(tx.state[0].quantity).toBe(-3);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
  });
});

describe("applyMovement", () => {
  const row = { id: "a", stockPlaceId: "place_1", elementId: "el_1", expireDate: null, quantity: 2 };

  it("writes nothing for a zero delta", async () => {
    const tx = txWithRows([{ id: "a", expireDate: null, quantity: 2 }]);
    expect(await applyMovement(tx as never, row, 0, "u_1")).toBe(2);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("clamps a hand count at zero and logs only what left", async () => {
    const tx = txWithRows([{ id: "a", expireDate: null, quantity: 2 }]);
    expect(await applyMovement(tx as never, row, -5, "u_1")).toBe(0);
    expect(lastMovement(tx)).toMatchObject({ delta: 2, isIn: false });
  });

  it("leaves an already-negative row alone when counting down — it never counts back up", async () => {
    const tx = txWithRows([{ id: "a", expireDate: null, quantity: -3 }]);
    const owed = { ...row, quantity: -3 };
    expect(await applyMovement(tx as never, owed, -1, "u_1")).toBe(-3);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("still adds to a negative row, back towards zero", async () => {
    const tx = txWithRows([{ id: "a", expireDate: null, quantity: -3 }]);
    const owed = { ...row, quantity: -3 };
    expect(await applyMovement(tx as never, owed, 5, "u_1")).toBe(2);
    expect(lastMovement(tx)).toMatchObject({ delta: 5, isIn: true });
  });

  it("goes past zero when the caller allows it", async () => {
    const tx = txWithRows([{ id: "a", expireDate: null, quantity: 2 }]);
    expect(await applyMovement(tx as never, row, -5, "u_1", { allowNegative: true })).toBe(-3);
    expect(lastMovement(tx)).toMatchObject({ delta: 5, isIn: false });
  });
});
