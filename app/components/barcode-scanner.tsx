"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard } from "lucide-react";

import { Alert, Button, Input } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { isValidBarcode, normalizeBarcode } from "@/lib/stock";

type Props = {
  locale: Locale;
  /** Called with the digits, once, as soon as a code is read. */
  onDetected: (barcode: string) => void;
  onCancel: () => void;
};

/**
 * The camera, reading an EAN.
 *
 * It is *not* a dialog: it renders inside the dialog that asked for it, in place
 * of that dialog's form, so scanning stays one step of the flow the person was
 * already in rather than a second window stacked on the first.
 *
 * Two ways in, because a phone in a cellar is not a reliable camera: the video,
 * and a plain field for the digits under the box — which is also where a
 * keyboard-wedge hardware scanner types, since those pretend to be a keyboard.
 * The field accepts nothing that is not a real GTIN, so both ways in are checked
 * the same.
 */
export function BarcodeScanner({ locale, onDetected, onCancel }: Props) {
  const copy = dictionaries[locale].stock;
  const shellCopy = dictionaries[locale].shell;

  const videoRef = useRef<HTMLVideoElement>(null);
  // The reader fires per frame; the first hit wins and everything after it is
  // ignored, or a code held in front of the lens would fire a lookup a second.
  const doneRef = useRef(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;

    async function start() {
      try {
        // Loaded here rather than at module scope: the decoder is a large bundle
        // and no stock screen should pay for it until someone taps scan.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);

        const hints = new Map();
        // Only the retail formats. A narrower list is a faster, steadier read.
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ]);

        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          // The back camera on a phone, the only camera on a laptop.
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current as HTMLVideoElement,
          (result) => {
            if (!result || doneRef.current) {
              return;
            }

            const barcode = normalizeBarcode(result.getText());

            if (!isValidBarcode(barcode)) {
              return;
            }

            doneRef.current = true;
            controls.stop();
            onDetected(barcode);
          },
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        stop = () => controls.stop();
      } catch {
        // No camera, no permission, or no secure context: the typed field below
        // is the whole answer, so this is a state and not an error to clear.
        if (!cancelled) {
          setCameraFailed(true);
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [onDetected]);

  function submitTyped() {
    const barcode = normalizeBarcode(typed);

    if (!isValidBarcode(barcode)) {
      setTypedError(true);
      return;
    }

    doneRef.current = true;
    onDetected(barcode);
  }

  return (
    <div className="space-y-4">
      {cameraFailed ? (
        <Alert tone="warning">{copy.scanNoCamera}</Alert>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-strong)]">
          <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">{copy.scanHint}</p>

      <div className="flex items-end gap-2">
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={typed}
          placeholder={copy.barcodePlaceholder}
          onChange={(event) => {
            setTyped(event.target.value);
            setTypedError(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // The scanner-as-keyboard ends its code with Enter, and this field
              // sits inside a form that would otherwise submit on it.
              event.preventDefault();
              submitTyped();
            }
          }}
        />
        <Button type="button" variant="secondary" icon={<Keyboard />} onClick={submitTyped}>
          {copy.useCode}
        </Button>
      </div>

      {typedError ? <Alert tone="error">{copy.scanInvalid}</Alert> : null}

      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        {shellCopy.cancel}
      </Button>
    </div>
  );
}
