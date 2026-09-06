/** The three payment methods a session can accept, in the order they are shown. */
export type PosMethod = "CASH" | "TWINT" | "BANK";

export const POS_METHODS: PosMethod[] = ["CASH", "TWINT", "BANK"];

const ORDER: Record<PosMethod, number> = { CASH: 0, TWINT: 1, BANK: 2 };

/** Sort a set of methods into CASH · TWINT · BANK order. */
export function orderMethods(methods: PosMethod[]): PosMethod[] {
  return [...methods].sort((a, b) => ORDER[a] - ORDER[b]);
}

type MethodLabels = { methodCash: string; methodTwint: string; methodBank: string };

export function methodLabel(copy: MethodLabels, method: PosMethod): string {
  if (method === "CASH") return copy.methodCash;
  if (method === "TWINT") return copy.methodTwint;
  return copy.methodBank;
}
