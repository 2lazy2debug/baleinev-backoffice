"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Minus, Plus, ReceiptText, Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import {
  Alert,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  cn,
  nestedSurfaceClasses,
} from "@/components/ui";
import { formatDenomination, fromRappen, makeChange } from "@/lib/cash";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { drawnSlots, pageCount, tilesOnPage } from "@/lib/pos-layout";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

import { methodLabel, orderMethods, type PosMethod } from "./pos-methods";
import { COLUMN_CHOICES, columnClasses, normalizeColumns, useTillColumns } from "./till-columns";
import { recordPosSaleAction } from "./session-actions";

export type Tile = {
  id: string;
  /** A SPACER is blank space the template author put in the stack — drawn as air. */
  kind: "ARTICLE" | "SPACER";
  elementId: string | null;
  label: string;
  /** Rappen — converted once from the cell's `Decimal` when the page built its props. */
  unitPrice: number;
};

type CartLine = { key: string; elementId: string | null; label: string; unitPrice: number; quantity: number };

const SALE_FORM_ID = "pos-sale";

/** One tile — a surface you tap, the same shape the template editor draws. */
function TileButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      as="div"
      span="auto"
      role="button"
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onKeyDown={
        disabled
          ? undefined
          : (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
      }
      className={cn(
        "flex h-full min-h-24 flex-col items-center justify-center gap-1 p-2 text-center transition sm:p-3",
        disabled ? "opacity-40" : "cursor-pointer hover:border-[var(--accent)]",
      )}
    >
      {children}
    </Card>
  );
}

export function Till({
  locale,
  sessionId,
  status,
  methods,
  tiles,
}: {
  locale: Locale;
  sessionId: string;
  status: "OPEN" | "PAUSED";
  methods: PosMethod[];
  tiles: Tile[];
}) {
  const copy = dictionaries[locale].pos;
  const router = useRouter();
  const paused = status === "PAUSED";

  const keyRef = useRef(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [page, setPage] = useState(0);
  const { columns, chooseColumns } = useTillColumns();

  const [listOpen, setListOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const [customLabel, setCustomLabel] = useState<string>(copy.customSale);
  const [customAmount, setCustomAmount] = useState("");

  const acceptedMethods = orderMethods(methods);
  const [method, setMethod] = useState<PosMethod>(acceptedMethods[0]);
  const [given, setGiven] = useState("");

  const [saleState, saleAction, salePending] = useActionState(recordPosSaleAction, initialActionState);
  const markSold = useCloseOnSuccess(saleState, salePending, () => {
    setCart([]);
    setGiven("");
    setCheckoutOpen(false);
    setListOpen(false);
    router.refresh();
  });

  const total = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  // The template is one stack; the page break comes from how wide *this* device
  // is selling, so re-picking the column count re-pages it. A page that no
  // longer exists after a widening lands the seller on the last one there is.
  const totalPages = pageCount(tiles.length, columns);
  const currentPage = Math.min(page, totalPages - 1);
  const pageTiles = tilesOnPage(tiles, currentPage, columns);
  const slots = drawnSlots(pageTiles.length, columns);

  function addLine(part: Omit<CartLine, "key" | "quantity">) {
    setCart((current) => {
      const index = current.findIndex(
        (line) =>
          line.elementId === part.elementId && line.label === part.label && line.unitPrice === part.unitPrice,
      );
      if (index >= 0) {
        const next = [...current];
        next[index] = { ...next[index], quantity: next[index].quantity + 1 };
        return next;
      }
      return [...current, { ...part, key: String(++keyRef.current), quantity: 1 }];
    });
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) =>
      current.flatMap((line) => {
        if (line.key !== key) return [line];
        const quantity = line.quantity + delta;
        return quantity <= 0 ? [] : [{ ...line, quantity }];
      }),
    );
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => line.key !== key));
  }

  // --- custom sale ---------------------------------------------------------
  const customAmountNorm = customAmount.replace(",", ".").trim();
  const customValid =
    customLabel.trim() !== "" &&
    customAmountNorm !== "" &&
    Number.isFinite(Number(customAmountNorm)) &&
    Number(customAmountNorm) !== 0;

  function closeCustom() {
    setCustomOpen(false);
    setCustomLabel(copy.customSale);
    setCustomAmount("");
  }

  function submitCustom() {
    addLine({ elementId: null, label: customLabel.trim(), unitPrice: Math.round(Number(customAmountNorm) * 100) });
    closeCustom();
  }

  // --- checkout -----------------------------------------------------------
  const isCash = method === "CASH";
  const refundSale = total <= 0;
  const givenNorm = given.replace(",", ".").trim();
  const givenValid = givenNorm !== "" && Number.isFinite(Number(givenNorm));
  const givenRappen = givenValid ? Math.round(Number(givenNorm) * 100) : Number.NaN;
  const shortPaid = isCash && !refundSale && givenValid && givenRappen < total;
  const changeRappen = refundSale ? -total : givenValid ? givenRappen - total : 0;
  const changeSheet = isCash && !shortPaid && (refundSale || givenValid) ? makeChange(changeRappen) : [];
  const canSell = !paused && cart.length > 0 && (!isCash || refundSale || (givenValid && givenRappen >= total));

  const quickFills: number[] = [];
  if (isCash && !refundSale) {
    const seen = new Set<number>([total]);
    for (const step of [1000, 2000, 5000, 10000]) seen.add(Math.ceil(total / step) * step);
    quickFills.push(...[...seen].filter((value) => value > 0).sort((a, b) => a - b));
  }

  const linesPayload = JSON.stringify(
    cart.map((line) => ({
      elementId: line.elementId,
      label: line.label,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    })),
  );

  return (
    <div className="space-y-4">
      {paused ? <Alert tone="warning">{copy.paused}</Alert> : null}

      <Card className="text-center">
        <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{copy.total}</p>
        <p className="text-3xl font-semibold tabular-nums">{formatCurrency(fromRappen(total))}</p>
      </Card>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {totalPages > 1 ? (
          <div className="flex items-center gap-3">
            <IconButton
              size="sm"
              tone="neutral"
              label={copy.previousPage}
              disabled={currentPage === 0}
              onClick={() => setPage(Math.max(0, currentPage - 1))}
            >
              <ChevronLeft />
            </IconButton>
            <span className="text-sm tabular-nums text-[var(--muted)]">
              {copy.pageOf.replace("{page}", String(currentPage + 1)).replace("{total}", String(totalPages))}
            </span>
            <IconButton
              size="sm"
              tone="neutral"
              label={copy.nextPage}
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight />
            </IconButton>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            {copy.columns}
          </span>
          <SegmentedControl
            size="sm"
            options={COLUMN_CHOICES.map((count) => ({ value: String(count), label: String(count) }))}
            value={String(columns)}
            onChange={(value) => chooseColumns(normalizeColumns(value))}
          />
        </div>
      </div>

      {/* Custom sale is the last slot of every page, so it is in the same corner
          whatever the width — a bar hits it without looking. Everything between
          the last tile and it is air: a spacer the template author placed, or
          the tail of a page that is not full. */}
      <div className={cn("grid gap-2", columnClasses[columns])}>
        {Array.from({ length: slots }, (_, slot) => {
          if (slot === slots - 1) {
            return (
              <TileButton key="custom" label={copy.customSale} disabled={paused} onClick={() => setCustomOpen(true)}>
                <Plus className="h-4 w-4" />
                <span className="text-2xs font-medium uppercase tracking-[0.08em]">{copy.customSale}</span>
              </TileButton>
            );
          }

          const tile = pageTiles[slot];

          if (!tile || tile.kind === "SPACER") {
            return <div key={tile?.id ?? `blank-${slot}`} className="min-h-24" />;
          }

          return (
            <TileButton
              key={tile.id}
              label={tile.label}
              disabled={paused}
              onClick={() => addLine({ elementId: tile.elementId, label: tile.label, unitPrice: tile.unitPrice })}
            >
              <span className="line-clamp-2 text-sm font-medium text-[var(--ink)]">{tile.label}</span>
              <span className="text-sm tabular-nums text-[var(--ink)]">{formatCurrency(fromRappen(tile.unitPrice))}</span>
            </TileButton>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          className="w-full"
          icon={<ReceiptText />}
          onClick={() => setListOpen(true)}
          disabled={cart.length === 0}
        >
          {copy.list}
        </Button>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => setCheckoutOpen(true)}
          disabled={cart.length === 0 || paused}
        >
          {copy.checkout}
        </Button>
      </div>

      {/* --- the cart list ------------------------------------------------- */}
      <Modal open={listOpen} onClose={() => setListOpen(false)} title={copy.list} size="sm" mobileFullScreen>
        <div className="space-y-2">
          {cart.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{copy.emptyCart}</p>
          ) : (
            cart.map((line) => (
              <div key={line.key} className={cn(nestedSurfaceClasses, "flex items-center gap-2 p-2")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.label}</p>
                  <p className="text-2xs tabular-nums text-[var(--muted)]">
                    {formatCurrency(fromRappen(line.unitPrice))} × {line.quantity} ={" "}
                    {formatCurrency(fromRappen(line.unitPrice * line.quantity))}
                  </p>
                </div>
                <IconButton size="sm" label={copy.decrease} onClick={() => changeQuantity(line.key, -1)}>
                  <Minus />
                </IconButton>
                <IconButton size="sm" label={copy.increase} onClick={() => changeQuantity(line.key, 1)}>
                  <Plus />
                </IconButton>
                <IconButton size="sm" tone="delete" label={copy.removeLine} onClick={() => removeLine(line.key)}>
                  <Trash2 />
                </IconButton>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 ? (
          <div className="mt-4">
            <Button
              variant="destructive"
              className="w-full"
              icon={<Trash2 />}
              onClick={() => {
                setCart([]);
                setListOpen(false);
              }}
            >
              {copy.clearSale}
            </Button>
          </div>
        ) : null}
      </Modal>

      {/* --- custom sale ------------------------------------------------------ */}
      <Modal
        open={customOpen}
        onClose={closeCustom}
        title={copy.customSale}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeCustom}>
              {copy.cancel}
            </Button>
            <Button type="button" variant="primary" onClick={submitCustom} disabled={!customValid}>
              {copy.add}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={copy.customSaleLabel}>
            <Input type="text" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} autoFocus />
          </Field>
          <Field label={copy.customSaleAmount}>
            <Input
              type="text"
              inputMode="decimal"
              value={customAmount}
              onChange={(event) => setCustomAmount(event.target.value)}
            />
          </Field>
          <p className="text-xs text-[var(--muted)]">{copy.priceHint}</p>
        </div>
      </Modal>

      {/* --- checkout ------------------------------------------------------- */}
      <Modal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title={copy.checkout}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setCheckoutOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" form={SALE_FORM_ID} variant="primary" disabled={salePending || !canSell}>
              {copy.sold}
            </Button>
          </>
        }
      >
        <form id={SALE_FORM_ID} action={saleAction} onSubmit={markSold} className="space-y-4">
          <FormError message={saleState.error} />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="method" value={method} />
          <input type="hidden" name="lines" value={linesPayload} />
          {isCash ? (
            <input type="hidden" name="cashGiven" value={refundSale ? "0" : givenValid ? String(givenRappen) : ""} />
          ) : null}

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{copy.total}</span>
            <span className="text-xl font-semibold tabular-nums">{formatCurrency(fromRappen(total))}</span>
          </div>

          {acceptedMethods.length > 1 ? (
            <SegmentedControl
              options={acceptedMethods.map((value) => ({ value, label: methodLabel(copy, value) }))}
              value={method}
              onChange={(value) => setMethod(value)}
            />
          ) : (
            <p className="text-sm text-[var(--muted)]">{methodLabel(copy, method)}</p>
          )}

          {isCash && !refundSale ? (
            <div className="space-y-2">
              <Field label={copy.amountGiven}>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={given}
                  onChange={(event) => setGiven(event.target.value)}
                  autoFocus
                />
              </Field>
              {quickFills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {quickFills.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setGiven(fromRappen(value).toFixed(2))}
                    >
                      {formatCurrency(fromRappen(value))}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {isCash && (refundSale || given !== "") ? (
            <div className={cn(nestedSurfaceClasses, "space-y-1 p-3")}>
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{refundSale ? copy.changeSheet : copy.changeDue}</span>
                <span className="tabular-nums">
                  {shortPaid ? "—" : formatCurrency(fromRappen(Math.max(changeRappen, 0)))}
                </span>
              </div>
              {shortPaid ? (
                <p className="text-2xs text-rose-300">{copy.amountShort}</p>
              ) : (
                changeSheet.map((row) => (
                  <div
                    key={row.denomination}
                    className="flex items-center justify-between text-2xs text-[var(--muted)]"
                  >
                    <span>
                      {row.quantity} &times; {formatDenomination(row.denomination)}
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
