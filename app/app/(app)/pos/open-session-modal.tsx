"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Alert, Button, Checkbox, Field, Input, Modal, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { POS_METHODS, methodLabel } from "./pos-methods";
import { openPosSessionAction } from "./session-actions";

export type TemplateOption = { id: string; name: string; tileCount: number };
export type RegisterOption = { id: string; name: string };
export type StockPlaceOption = { id: string; name: string };

const FORM_ID = "open-pos-session";

/**
 * The one shape for creating in this app — a header button and a `<Modal>`.
 * Shared by the picker screen and the sessions manager, so "open a session"
 * reads and behaves the same wherever it is offered. The register `<Select>`
 * appears only once **Cash** is ticked: a session that takes no cash stores no
 * drawer.
 *
 * The stock place is optional and empty by default — a session that moves no
 * stock is what every session does today — and is fixed at open: moving a
 * running session to another shelf would make its earlier sales lie about where
 * the stock came from.
 */
export function OpenSessionModal({
  locale,
  templates,
  registers,
  stockPlaces,
}: {
  locale: Locale;
  templates: TemplateOption[];
  registers: RegisterOption[];
  stockPlaces: StockPlaceOption[];
}) {
  const copy = dictionaries[locale].pos;
  const router = useRouter();
  const isReadOnly = useEditionReadOnly();
  const [open, setOpen] = useState(false);
  const [methods, setMethods] = useState<Record<string, boolean>>({ CASH: true, TWINT: false, BANK: false });
  const [state, formAction, pending] = useActionState(openPosSessionAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, () => {
    setOpen(false);
    router.refresh();
  });

  if (isReadOnly) {
    return null;
  }

  const cashTicked = methods.CASH;

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.openSession}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.openSession}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={pending}>
              {copy.openSession}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />

          <Field label={copy.sessionName}>
            <Input type="text" name="name" required autoFocus />
          </Field>

          <Field label={copy.template}>
            <Select name="templateId" required defaultValue="">
              <option value="" disabled>
                {copy.template}
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id} disabled={template.tileCount === 0}>
                  {template.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-2">
            <span className="text-sm font-medium">{copy.paymentMethods}</span>
            <div className="flex flex-col gap-2">
              {POS_METHODS.map((method) => (
                <Checkbox
                  key={method}
                  name="methods"
                  value={method}
                  checked={methods[method]}
                  onChange={(event) => setMethods((current) => ({ ...current, [method]: event.target.checked }))}
                  label={methodLabel(copy, method)}
                />
              ))}
            </div>
          </div>

          {cashTicked ? (
            registers.length === 0 ? (
              <Alert tone="warning">{copy.needsOpenRegister}</Alert>
            ) : (
              <Field label={copy.register}>
                <Select name="cashRegisterId" required defaultValue="">
                  <option value="" disabled>
                    {copy.register}
                  </option>
                  {registers.map((register) => (
                    <option key={register.id} value={register.id}>
                      {register.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )
          ) : null}

          {stockPlaces.length > 0 ? (
            <Field label={copy.stockPlace}>
              <Select name="stockPlaceId" defaultValue="">
                <option value="">{copy.noStockPlace}</option>
                {stockPlaces.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </Select>
              <span className="block text-xs text-[var(--muted)]">{copy.stockPlaceHint}</span>
            </Field>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
