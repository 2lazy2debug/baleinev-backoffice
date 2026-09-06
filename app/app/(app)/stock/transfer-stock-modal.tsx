"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Field, Input, Modal } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";
import { formatExpiry, formatPiece } from "@/lib/stock";

import { transferStockItemAction } from "./actions";
import { StockPlaceList, type StockPlaceOption } from "./stock-place-switcher";
import type { StockRow } from "./client";

type Props = {
  locale: Locale;
  /** The row being moved. `null` closes the dialog. */
  row: StockRow | null;
  /** Every stock except the one currently open. */
  destinations: StockPlaceOption[];
  onClose: () => void;
};

/**
 * Picking a destination *is* the submit — same as the switcher this reuses
 * `StockPlaceList` from. There is no footer button because there is nothing
 * left to decide after that pick.
 *
 * The caller keys this on `row?.id` (see `client.tsx`), so a fresh row remounts
 * the component instead of needing an effect to reset the quantity draft.
 */
export function TransferStockModal({ locale, row, destinations, onClose }: Props) {
  const copy = dictionaries[locale].stock;
  const router = useRouter();

  const [quantity, setQuantity] = useState(() => String(row?.quantity ?? ""));

  async function transfer(previous: ActionState, toStockPlaceId: string): Promise<ActionState> {
    if (!row) {
      return { error: null };
    }

    const formData = new FormData();
    formData.set("stockItemId", row.id);
    formData.set("toStockPlaceId", toStockPlaceId);
    formData.set("quantity", quantity.trim() || "0");

    const result = await transferStockItemAction(previous, formData);
    if (result.error) {
      return result;
    }

    router.refresh();
    return result;
  }

  const [state, dispatch, pending] = useActionState(transfer, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, onClose);

  if (!row) {
    return null;
  }

  return (
    <Modal open={row !== null} onClose={onClose} title={copy.transferTitle} size="sm">
      <div className="space-y-4">
        <FormError message={state.error} />

        <div className="text-sm">
          <span className="font-medium">{row.name}</span>
          {row.brand ? <span className="text-2xs text-[var(--muted)]"> — {row.brand}</span> : null}
          <span className="block text-2xs text-[var(--muted)]">
            {formatPiece(row.unitQty, row.unitName)}
            {row.expireDate ? ` · ${formatExpiry(row.expireDate, locale)}` : ""}
          </span>
        </div>

        <Field label={copy.quantity}>
          <Input
            type="number"
            min={1}
            step={1}
            max={row.quantity}
            value={quantity}
            disabled={pending}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>

        <p className="text-2xs text-[var(--muted)]">{copy.transferHint}</p>

        <StockPlaceList
          locale={locale}
          places={destinations}
          disabled={pending}
          onPick={(toStockPlaceId) => {
            markSubmitted();
            dispatch(toStockPlaceId);
          }}
        />
      </div>
    </Modal>
  );
}
