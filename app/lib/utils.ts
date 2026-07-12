export function formatCurrency(value: number) {
  const isNegative = value < 0;
  const absolute = Math.abs(value);
  const fixed = absolute.toFixed(2);
  const [whole, fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const amount = `${grouped}.${fraction}`;

  return `CHF ${isNegative ? "-" : ""}${amount}`;
}

export function decimalToNumber(value: { toString(): string } | number | null | undefined) {
  if (value == null) {
    return 0;
  }

  return Number(typeof value === "number" ? value : value.toString());
}

export const EDITION_NAME_PATTERN = /^(\d{4})-(\d{4})$/;

export function isValidEditionName(name: string) {
  return EDITION_NAME_PATTERN.test(name);
}

export function incrementEditionName(name: string) {
  const match = name.match(EDITION_NAME_PATTERN);

  if (!match) {
    throw new Error("Edition names must follow the YYYY-YYYY format.");
  }

  return `${Number(match[1]) + 1}-${Number(match[2]) + 1}`;
}