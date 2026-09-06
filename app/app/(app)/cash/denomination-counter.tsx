"use client";

import { Input, Panel } from "@/components/ui";
import { CASH_DENOMINATIONS, countTotal, formatDenomination, fromRappen } from "@/lib/cash";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { formatCurrency } from "@/lib/utils";

type Props = {
  locale: Locale;
  /** Field name prefix; each row posts `${name}-${denomination}`. */
  name: string;
  value: Record<number, number>;
  onChange: (next: Record<number, number>) => void;
  disabled?: boolean;
};

/**
 * Twelve rows — one Swiss denomination each, largest first — a live subtotal per
 * row and a running total in the footer. The total is the whole point: the
 * person counting checks it against the cash in their hand before they submit.
 *
 * Empty means zero. A blank field posts nothing and the server reads a missing
 * row as "counted, none", so there is no reason to pre-fill twelve zeros.
 */
export function DenominationCounter({ locale, name, value, onChange, disabled = false }: Props) {
  const copy = dictionaries[locale].cash;

  const total = countTotal(
    CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: value[denomination] ?? 0 })),
  );

  function setRow(denomination: number, raw: string) {
    const next = { ...value };
    const quantity = Number.parseInt(raw, 10);

    if (!raw || Number.isNaN(quantity) || quantity <= 0) {
      delete next[denomination];
    } else {
      next[denomination] = quantity;
    }

    onChange(next);
  }

  return (
    <Panel nested className="p-2">
      <div className="space-y-1">
        {CASH_DENOMINATIONS.map((denomination) => {
          const quantity = value[denomination] ?? 0;

          return (
            <div key={denomination} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-[var(--muted)]">{formatDenomination(denomination)}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                size="sm"
                name={`${name}-${denomination}`}
                aria-label={formatDenomination(denomination)}
                value={value[denomination] ?? ""}
                onChange={(event) => setRow(denomination, event.target.value)}
                disabled={disabled}
                className="w-20"
              />
              <span className="min-w-0 flex-1 text-right text-xs text-[var(--muted)]">
                {quantity > 0 ? formatCurrency(fromRappen(denomination * quantity)) : null}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-[var(--line)] pt-2 text-sm font-semibold">
        <span>{copy.total}</span>
        <span>{formatCurrency(fromRappen(total))}</span>
      </div>
    </Panel>
  );
}
