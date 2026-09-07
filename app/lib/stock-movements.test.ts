import { beforeEach, describe, expect, it, vi } from "vitest";

// `removeFromPlace` is the piece 107 added: the POS calls it once per sold line
// inside its own sale transaction. It never refuses and never goes negative —
// oldest expiry first, clamped at zero exactly as the +/- buttons are.
//
// Nothing is mocked: the helper takes the caller's transaction client, so a fake
// one is the whole fixture.
import { removeFromPlace } from "./stock-movements";

/** A fake transaction client that keeps each row's quantity in step with the writes. */
function txWithRows(rows: Array<{ id: string; expireDate: Date | null; quantity: number }>) {
  const state = rows.map((row) => ({ stockPlaceId: "place_1", elementId: "el_1", ...row }));
  return {
    state,
    stockItem: {
      findMany: vi.fn(async () => state.filter((row) => row.quantity > 0)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { quantity: number } }) => {
        const row = state.find((r) => r.id === where.id)!;
        row.quantity = data.quantity;
      }),
    },
    stockMovement: { create: vi.fn() },
  };
}

const D = (iso: string) => new Date(iso);

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

  it("clamps to what is on the shelf and returns how many actually left — never refuses, never negative", async () => {
    const tx = txWithRows([{ id: "a", expireDate: null, quantity: 2 }]);
    const taken = await removeFromPlace(tx as never, { stockPlaceId: "place_1", elementId: "el_1" }, 5, "u_1");

    expect(taken).toBe(2);
    expect(tx.state[0].quantity).toBe(0);
    expect(tx.stockMovement.create.mock.calls[0][0].data).toMatchObject({ delta: 2, isIn: false });
  });

  it("writes nothing when the shelf is empty", async () => {
    const tx = txWithRows([]);
    const taken = await removeFromPlace(tx as never, { stockPlaceId: "place_1", elementId: "el_1" }, 3, "u_1");

    expect(taken).toBe(0);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
