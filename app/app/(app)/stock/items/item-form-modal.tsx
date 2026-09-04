"use client";

import { useActionState, useCallback, useState, useTransition } from "react";
import { ScanBarcode } from "lucide-react";

import { BarcodeScanner } from "@/components/barcode-scanner";
import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Alert, Button, Checkbox, Field, IconButton, Input, Modal } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

import { createStockElementAction, lookupBarcodeAction, updateStockElementAction } from "../actions";
import { UnitSizeFields, type ConversionOption, type UnitOption } from "../unit-size-fields";

export type { ConversionOption, UnitOption };

export type ItemDraft = {
  id: string;
  name: string;
  brand: string;
  barcode: string;
  unitId: string;
  unitQty: string;
  expireable: boolean;
};

type Props = {
  locale: Locale;
  units: UnitOption[];
  conversions: ConversionOption[];
  open: boolean;
  onClose: () => void;
  /** The item being edited, or null to create one. */
  item: ItemDraft | null;
};

const FORM_ID = "stock-item-form";

/** What a scan filled in, on top of the item (or the blank form) underneath it. */
type Scanned = {
  barcode: string;
  name: string;
  brand: string;
  unitQty: string;
  unitId: string;
};

/**
 * What an item *is*, in one dialog — used both by the header's create button and
 * by the pencil on a row.
 *
 * Editing is a dialog on every breakpoint rather than an inline row editor: five
 * fields, one of them a checkbox, do not fit a table cell on a phone, and a
 * second mobile-only editor is exactly the drift the design rules forbid.
 *
 * The barcode is the field a scan writes. Scanning here files the code on an
 * item — the camera opens in place of the form, as it does in the stock dialog —
 * and on a new item it brings the name, brand and size along with it when Open
 * Food Facts knows the product.
 */
export function ItemFormModal({ locale, units, conversions, open, onClose, item }: Props) {
  const copy = dictionaries[locale].stock;
  const shellCopy = dictionaries[locale].shell;

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();

  async function submit(previous: ActionState, formData: FormData): Promise<ActionState> {
    return item ? updateStockElementAction(previous, formData) : createStockElementAction(previous, formData);
  }

  const [state, formAction, pending] = useActionState(submit, initialActionState);

  const close = useCallback(() => {
    setScanning(false);
    setScanned(null);
    setScanNote(null);
    onClose();
  }, [onClose]);

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

        // Already filed, and not on the item being edited: the unique code would
        // be refused on save, so say so now rather than after the round trip.
        if (result.status === "known") {
          setScanNote(result.elementId === item?.id ? copy.scanSameItem : copy.scanAlreadyFiled);
          return;
        }

        setScanned({
          barcode: result.barcode,
          // An item being edited keeps what it says it is; only the code is new.
          name: item ? item.name : result.name,
          brand: item ? item.brand : result.brand,
          unitQty: item ? item.unitQty : result.unitQty,
          unitId: item ? item.unitId : result.unitId,
        });
        setScanNote(!item && result.prefilled ? copy.scanPrefilled : copy.scanCodeRead);
      });
    },
    [copy.scanAlreadyFiled, copy.scanCodeRead, copy.scanInvalid, copy.scanPrefilled, copy.scanSameItem, item],
  );

  const values = {
    name: scanned?.name ?? item?.name ?? "",
    brand: scanned?.brand ?? item?.brand ?? "",
    barcode: scanned?.barcode ?? item?.barcode ?? "",
    unitQty: scanned?.unitQty || item?.unitQty || "1",
    unitId: scanned?.unitId || item?.unitId || "",
  };

  // The size is the one pair of fields the convert button rewrites, so it is
  // held here rather than left to the DOM. It follows the form's identity: a
  // different row, or a fresh scan, is a different size to start from.
  const formKey = `${item?.id ?? "new"}-${scanned?.barcode ?? ""}`;
  const [size, setSize] = useState({ key: formKey, unitQty: values.unitQty, unitId: values.unitId });

  if (size.key !== formKey) {
    setSize({ key: formKey, unitQty: values.unitQty, unitId: values.unitId });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={scanning ? copy.scanCode : item ? copy.editItem : copy.createItem}
      size="md"
      mobileFullScreen
      footer={
        scanning ? null : (
          <>
            <Button type="button" variant="secondary" onClick={close}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={pending || looking}>
              {shellCopy.save}
            </Button>
          </>
        )
      }
    >
      {scanning ? <BarcodeScanner locale={locale} onDetected={handleScanned} onCancel={() => setScanning(false)} /> : null}

      {/* Keyed on the item and on the scan so the uncontrolled fields reset
          between two rows opened one after the other, and pick up what a scan
          brought back. Hidden rather than unmounted while the camera is up, so
          nothing already typed is thrown away. */}
      <form
        key={`${item?.id ?? "new"}-${scanned?.barcode ?? ""}`}
        id={FORM_ID}
        action={formAction}
        onSubmit={markSubmitted}
        className={scanning ? "hidden" : "space-y-4"}
      >
        <FormError message={state.error} />
        {item ? <input type="hidden" name="elementId" value={item.id} /> : null}

        {scanNote ? <Alert tone="info">{scanNote}</Alert> : null}

        <Field label={copy.name}>
          <Input type="text" name="name" defaultValue={values.name} required autoFocus />
        </Field>
        <Field label={copy.brand}>
          <Input type="text" name="brand" defaultValue={values.brand} />
        </Field>
        <div className="flex items-end gap-2">
          <Field label={copy.barcode} className="flex-1">
            <Input
              type="text"
              inputMode="numeric"
              name="barcode"
              defaultValue={values.barcode}
              placeholder={copy.barcodePlaceholder}
            />
          </Field>
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
        </div>
        <UnitSizeFields
          locale={locale}
          units={units}
          conversions={conversions}
          unitQty={size.unitQty}
          unitId={size.unitId}
          onChange={(next) => setSize({ key: formKey, ...next })}
        />
        <div className="space-y-1">
          <Checkbox
            id="stock-item-expireable"
            name="expireable"
            label={copy.expireable}
            defaultChecked={item?.expireable ?? false}
          />
          <p className="text-xs text-[var(--muted)]">{copy.expireableHint}</p>
        </div>
      </form>
    </Modal>
  );
}
