"use client";

import { useActionState, useCallback, useState, useTransition } from "react";
import { Plus, ScanBarcode } from "lucide-react";

import { BarcodeScanner } from "@/components/barcode-scanner";
import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Alert, Button, Checkbox, Field, IconButton, Input, Modal, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { formatPiece } from "@/lib/stock";
import { initialActionState } from "@/lib/server-action-helpers";

import { addStockAction, lookupBarcodeAction } from "./actions";

export type ElementOption = {
  id: string;
  name: string;
  brand: string;
  unitName: string;
  unitQty: number;
  expireable: boolean;
};

export type UnitOption = {
  id: string;
  name: string;
};

type Props = {
  locale: Locale;
  stockPlaceId: string;
  elements: ElementOption[];
  units: UnitOption[];
};

/** What a scan filled the "new item" half of the form with. */
type Prefill = {
  barcode: string;
  name: string;
  brand: string;
  unitQty: string;
  unitId: string;
};

const FORM_ID = "add-stock-form";

const emptyPrefill: Prefill = { barcode: "", name: "", brand: "", unitQty: "", unitId: "" };

/**
 * The one way stock comes in: pick an item, say how many, and — only when the
 * item expires — say until when.
 *
 * The item can also be invented here. The catalogue screen is where items are
 * kept tidy, but someone standing in front of a delivery of something the book
 * has never held should not have to leave the dialog to file it first: ticking
 * "new item" creates the catalogue entry and stocks it in the same submission.
 *
 * Scanning is that same pair of halves, entered by the barcode rather than by
 * hand. The camera replaces the form *inside this dialog* — there is no second
 * window — and the answer decides which half comes back: a code the catalogue
 * knows selects its item and leaves the person on the quantity field, a code
 * nobody has filed opens the "new item" half with whatever Open Food Facts knows
 * about it already typed in.
 */
export function AddStockModal({ locale, stockPlaceId, elements, units }: Props) {
  const copy = dictionaries[locale].stock;
  const shellCopy = dictionaries[locale].shell;

  const [open, setOpen] = useState(false);
  const [creatingElement, setCreatingElement] = useState(false);
  const [elementId, setElementId] = useState("");
  const [newElementExpires, setNewElementExpires] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [prefill, setPrefill] = useState<Prefill>(emptyPrefill);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();

  const [state, formAction, pending] = useActionState(addStockAction, initialActionState);

  // Closing resets the dialog, not just its visibility: the next "new entry" is
  // a new entry, never the last one's half-filled form.
  const close = useCallback(() => {
    setOpen(false);
    setCreatingElement(false);
    setElementId("");
    setNewElementExpires(false);
    setScanning(false);
    setPrefill(emptyPrefill);
    setScanNote(null);
  }, []);

  const markSubmitted = useCloseOnSuccess(state, pending, close);

  const handleScanned = useCallback(
    (barcode: string) => {
      setScanning(false);

      startLookup(async () => {
        const result = await lookupBarcodeAction(barcode);

        if (result.status === "invalid") {
          setScanNote(copy.scanInvalid);
          return;
        }

        if (result.status === "known") {
          setCreatingElement(false);
          setPrefill(emptyPrefill);
          setElementId(result.elementId);
          setScanNote(copy.scanFound);
          return;
        }

        setCreatingElement(true);
        setElementId("");
        setNewElementExpires(false);
        setPrefill({
          barcode: result.barcode,
          name: result.name,
          brand: result.brand,
          unitQty: result.unitQty,
          unitId: result.unitId,
        });
        setScanNote(result.prefilled ? copy.scanPrefilled : copy.scanUnknown);
      });
    },
    [copy.scanFound, copy.scanInvalid, copy.scanPrefilled, copy.scanUnknown],
  );

  // Which item the dialog is about decides whether there is an expiry field at
  // all — a date on something that does not expire is a second, invisible shelf.
  const selected = elements.find((element) => element.id === elementId) ?? null;
  const expires = creatingElement ? newElementExpires : (selected?.expireable ?? false);

  const scanButton = (
    <IconButton
      size="md"
      tone="neutral"
      label={copy.scanCode}
      disabled={looking}
      onClick={() => {
        setScanNote(null);
        setScanning(true);
      }}
    >
      <ScanBarcode />
    </IconButton>
  );

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>
        {copy.newEntry}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={scanning ? copy.scanCode : copy.newEntry}
        size="md"
        mobileFullScreen
        footer={
          scanning ? null : (
            <>
              <Button type="button" variant="secondary" onClick={close}>
                {shellCopy.cancel}
              </Button>
              <Button type="submit" form={FORM_ID} variant="primary" disabled={pending || looking}>
                {copy.add}
              </Button>
            </>
          )
        }
      >
        {scanning ? <BarcodeScanner locale={locale} onDetected={handleScanned} onCancel={() => setScanning(false)} /> : null}

        {/* Hidden rather than unmounted while the camera is up: the fields are
            uncontrolled, and unmounting would throw away what is already typed. */}
        <form
          // Keyed on the scan so a lookup's values reach the uncontrolled fields.
          key={prefill.barcode || "manual"}
          id={FORM_ID}
          action={formAction}
          onSubmit={markSubmitted}
          className={scanning ? "hidden" : "space-y-4"}
        >
          <FormError message={state.error} />
          <input type="hidden" name="stockPlaceId" value={stockPlaceId} />

          {scanNote ? <Alert tone="info">{scanNote}</Alert> : null}

          {creatingElement ? (
            <>
              <input type="hidden" name="createElement" value="on" />
              <input type="hidden" name="barcode" value={prefill.barcode} />
              <div className="flex items-end gap-2">
                <Field label={copy.name} className="flex-1">
                  <Input type="text" name="name" defaultValue={prefill.name} required autoFocus />
                </Field>
                {scanButton}
              </div>
              <Field label={copy.brand}>
                <Input type="text" name="brand" defaultValue={prefill.brand} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={copy.unitQty}>
                  <Input
                    type="text"
                    inputMode="decimal"
                    name="unitQty"
                    defaultValue={prefill.unitQty || "1"}
                    required
                  />
                </Field>
                <Field label={copy.unit}>
                  <Select name="unitId" required defaultValue={prefill.unitId}>
                    <option value="" disabled>
                      {copy.unit}
                    </option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Checkbox
                id="add-stock-expireable"
                name="expireable"
                label={copy.expireable}
                checked={newElementExpires}
                onChange={(event) => setNewElementExpires(event.target.checked)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreatingElement(false);
                  setPrefill(emptyPrefill);
                  setScanNote(null);
                }}
              >
                {copy.pickExistingItem}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <Field label={copy.item} className="flex-1">
                  <Select
                    name="elementId"
                    required
                    value={elementId}
                    onChange={(event) => setElementId(event.target.value)}
                  >
                    <option value="" disabled>
                      {copy.selectItem}
                    </option>
                    {elements.map((element) => (
                      <option key={element.id} value={element.id}>
                        {[element.name, element.brand].filter(Boolean).join(" - ")} ·{" "}
                        {formatPiece(element.unitQty, element.unitName)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {scanButton}
              </div>
              <Button type="button" variant="ghost" size="sm" icon={<Plus />} onClick={() => setCreatingElement(true)}>
                {copy.createItemInline}
              </Button>
            </>
          )}

          <Field label={copy.initialQuantity}>
            <Input type="number" name="quantity" min={1} step={1} defaultValue={1} required />
          </Field>

          {expires ? (
            <Field label={copy.expiryDate}>
              <Input type="date" name="expireDate" />
              <span className="block text-xs text-[var(--muted)]">{copy.expiryHint}</span>
            </Field>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
