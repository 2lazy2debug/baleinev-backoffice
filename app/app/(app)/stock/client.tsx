"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Check, Minus, Pencil, Plus, Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
import {
  Badge,
  Cardlet,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  IconButton,
  Input,
  Panel,
  PanelHeader,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";
import { formatExpiry, formatPiece, formatTotal } from "@/lib/stock";

import { adjustStockItemAction, removeStockItemAction, setStockItemQuantityAction } from "./actions";

export type StockRow = {
  id: string;
  name: string;
  brand: string;
  unitName: string;
  unitQty: number;
  expireable: boolean;
  /** `yyyy-mm-dd`, or null when the item does not expire or the date is unknown. */
  expireDate: string | null;
  quantity: number;
};

type Props = {
  locale: Locale;
  rows: StockRow[];
};

/** A shelf a month out or less is worth seeing before it is counted. */
const WARNING_DAYS = 30;

function expiryTone(expireDate: string | null): "error" | "warning" | "neutral" {
  if (!expireDate) {
    return "neutral";
  }

  const days = (new Date(`${expireDate}T00:00:00.000Z`).getTime() - Date.now()) / 86_400_000;

  if (days < 0) {
    return "error";
  }

  return days <= WARNING_DAYS ? "warning" : "neutral";
}

/**
 * One stock's contents.
 *
 * A quantity moves two ways, and both of them log. The +/- buttons are always
 * live: on a locked row they go straight to the server, one movement per click.
 * The edit button unlocks the field instead — the buttons then move the number
 * being typed, and locking it again saves the whole correction as a single
 * movement, which is what a recount actually is.
 */
export function StockClient({ locale, rows }: Props) {
  const copy = dictionaries[locale].stock;
  const router = useRouter();

  const [filter, setFilter] = useState("");
  // The row whose quantity is unlocked, and the number being typed into it.
  const [editing, setEditing] = useState<{ id: string; quantity: string } | null>(null);

  async function saveQuantity(previous: ActionState): Promise<ActionState> {
    if (!editing) {
      return { error: null };
    }

    const formData = new FormData();
    formData.set("stockItemId", editing.id);
    formData.set("quantity", editing.quantity.trim() || "0");

    const result = await setStockItemQuantityAction(previous, formData);
    if (result.error) {
      return result;
    }

    setEditing(null);
    router.refresh();
    return result;
  }

  const [adjustState, adjustFormAction, isAdjusting] = useActionState(adjustStockItemAction, initialActionState);
  const [saveState, saveFormAction, isSaving] = useActionState(saveQuantity, initialActionState);
  const [removeState, removeFormAction, isRemoving] = useActionState(removeStockItemAction, initialActionState);

  const needle = filter.trim().toLowerCase();
  // Derived once: the table above `sm` and the cardlets below it render this
  // same array, so the two can never disagree about what is on the shelf.
  const visible = rows.filter(
    (row) => !needle || `${row.name} ${row.brand}`.toLowerCase().includes(needle),
  );

  function stepDraft(row: StockRow, step: number) {
    setEditing((current) =>
      current && current.id === row.id
        ? { ...current, quantity: String(Math.max(0, (Number(current.quantity) || 0) + step)) }
        : current,
    );
  }

  /** The `[-] [count] [+]` group, identical in a table cell and in a cardlet. */
  function stepper(row: StockRow) {
    const draft = editing?.id === row.id ? editing : null;

    return (
      <div className="flex items-center gap-1">
        {draft ? (
          <IconButton label={copy.removeOne} onClick={() => stepDraft(row, -1)} disabled={Number(draft.quantity) <= 0}>
            <Minus />
          </IconButton>
        ) : (
          <form action={adjustFormAction}>
            <input type="hidden" name="stockItemId" value={row.id} />
            <input type="hidden" name="delta" value="-1" />
            <IconButton type="submit" label={copy.removeOne} disabled={isAdjusting || row.quantity <= 0}>
              <Minus />
            </IconButton>
          </form>
        )}

        {draft ? (
          <Input
            size="sm"
            type="number"
            min={0}
            step={1}
            autoFocus
            className="w-16 text-center"
            value={draft.quantity}
            onChange={(event) => setEditing({ id: row.id, quantity: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveFormAction();
              }
            }}
          />
        ) : (
          <span className="w-16 text-center text-sm font-semibold tabular-nums">{row.quantity}</span>
        )}

        {draft ? (
          <IconButton label={copy.addOne} onClick={() => stepDraft(row, 1)}>
            <Plus />
          </IconButton>
        ) : (
          <form action={adjustFormAction}>
            <input type="hidden" name="stockItemId" value={row.id} />
            <input type="hidden" name="delta" value="1" />
            <IconButton type="submit" label={copy.addOne} disabled={isAdjusting}>
              <Plus />
            </IconButton>
          </form>
        )}
      </div>
    );
  }

  /** Unlock / lock the quantity, and take the whole row out of the stock. */
  function rowActions(row: StockRow) {
    const draft = editing?.id === row.id ? editing : null;

    return (
      <div className="flex items-center gap-2">
        {draft ? (
          <IconButton tone="save" label={copy.saveQuantity} disabled={isSaving} onClick={() => saveFormAction()}>
            <Check />
          </IconButton>
        ) : (
          <IconButton
            tone="accent"
            label={copy.editQuantity}
            onClick={() => setEditing({ id: row.id, quantity: String(row.quantity) })}
          >
            <Pencil />
          </IconButton>
        )}
        <form action={removeFormAction}>
          <input type="hidden" name="stockItemId" value={row.id} />
          <IconButton type="submit" tone="delete" label={copy.removeFromStock} disabled={isRemoving}>
            <Trash2 />
          </IconButton>
        </form>
      </div>
    );
  }

  function expiryCell(row: StockRow) {
    if (!row.expireable) {
      return null;
    }

    if (!row.expireDate) {
      return <span className="text-[var(--muted)]">-</span>;
    }

    const tone = expiryTone(row.expireDate);
    const label = formatExpiry(row.expireDate, locale);

    return tone === "neutral" ? (
      <span className="tabular-nums">{label}</span>
    ) : (
      <Badge tone={tone}>{label}</Badge>
    );
  }

  const error = adjustState.error ?? saveState.error ?? removeState.error;

  return (
    <Panel as="div" className="bg-[var(--panel)]">
      <PanelHeader>
        <p className="text-xs text-[var(--muted)]">
          {copy.showing} {visible.length} {copy.of} {rows.length}
        </p>
      </PanelHeader>

      {error ? (
        <div className="border-b border-[var(--line)] px-4 py-2">
          <FormError message={error} />
        </div>
      ) : null}

      <Table frame={false} desktopOnly className="table-fixed">
        {/* The quantity column has to hold two 32px buttons and the count between
            them, and the actions column two more; a column that shrinks under
            them clips the last one. The item name takes whatever is left. */}
        <colgroup>
          <col />
          <col className="w-28" />
          <col className="w-36" />
          <col className="w-40" />
          <col className="w-28" />
          <col className="w-28" />
        </colgroup>
        <THead className="sticky top-0">
          <TR>
            <TH>{copy.item}</TH>
            <TH>{copy.piece}</TH>
            <TH>{copy.expiry}</TH>
            <TH>{copy.quantity}</TH>
            <TH>{copy.total}</TH>
            <TH>{copy.actions}</TH>
          </TR>
          <TR className="bg-[var(--panel)] normal-case">
            <TH>
              <Input
                type="text"
                size="sm"
                placeholder={copy.filter}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </TH>
            <TH colSpan={5} />
          </TR>
        </THead>
        <tbody>
          {visible.map((row) => (
            <TR key={row.id} className={editing?.id === row.id ? "bg-[var(--panel-strong)]" : undefined}>
              <TD>
                <span className="block truncate font-medium">{row.name}</span>
                {row.brand ? <span className="block truncate text-2xs text-[var(--muted)]">{row.brand}</span> : null}
              </TD>
              <TD className="text-[var(--muted)]">{formatPiece(row.unitQty, row.unitName)}</TD>
              <TD>{expiryCell(row)}</TD>
              <TD>{stepper(row)}</TD>
              <TD className="font-semibold tabular-nums">{formatTotal(row.quantity, row.unitQty, row.unitName)}</TD>
              <TD>{rowActions(row)}</TD>
            </TR>
          ))}
        </tbody>
      </Table>

      {/* Below `sm` the same rows, kept tight: what it is and when it goes off on
          one line, the piece and the total on the next, and the controls that
          are the whole point of the screen on the last. */}
      <CardletList className="p-3">
        {visible.map((row) => (
          <Cardlet key={row.id}>
            <CardletHeader
              title={
                <>
                  <p className="truncate">{row.name}</p>
                  {row.brand ? <p className="truncate text-3xs font-normal text-[var(--muted)]">{row.brand}</p> : null}
                </>
              }
              action={expiryCell(row)}
            />
            <CardletFields>
              <CardletField label={copy.piece}>{formatPiece(row.unitQty, row.unitName)}</CardletField>
              <CardletField label={copy.total}>{formatTotal(row.quantity, row.unitQty, row.unitName)}</CardletField>
            </CardletFields>
            <div className="flex items-center justify-between gap-2">
              {stepper(row)}
              {rowActions(row)}
            </div>
          </Cardlet>
        ))}
      </CardletList>

      {visible.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[var(--muted)]">{rows.length === 0 ? copy.empty : copy.noMatch}</p>
      ) : null}
    </Panel>
  );
}
