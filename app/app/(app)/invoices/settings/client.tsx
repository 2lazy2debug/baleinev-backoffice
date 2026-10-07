"use client";

import { useActionState } from "react";

import { FormError } from "@/components/form-error";
import { Button, Card, CardGrid, Field, SectionTitle, Textarea } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { updateInvoiceTemplateAction } from "./actions";

type Props = {
  locale: Locale;
  templateHtml: string;
  placeholders: string[];
};

/** The invoice layout editor, with the [[field]] placeholders it can use beside it. */
export function InvoiceSettingsClient({ locale, templateHtml, placeholders }: Props) {
  const copy = dictionaries[locale].invoices;
  const [state, formAction, isSaving] = useActionState(updateInvoiceTemplateAction, initialActionState);

  return (
    <CardGrid>
      <Card as="section" span="2/3">
        <form action={formAction} className="space-y-3">
          <FormError message={state.error} />
          <Field required label={copy.templateHtml}>
            <Textarea
              name="templateHtml"
              defaultValue={templateHtml}
              required
              rows={26}
              size="sm"
              className="min-h-[420px] font-mono"
            />
          </Field>
          <Button type="submit" variant="primary" disabled={isSaving}>
            {copy.saveTemplate}
          </Button>
        </form>
      </Card>

      <Card as="section" span="1/3-lg">
        <SectionTitle>{copy.templatePlaceholders}</SectionTitle>
        <ul className="mt-4 space-y-2 font-mono text-xs text-[var(--muted)]">
          {placeholders.map((placeholder) => (
            <li key={placeholder}>{placeholder}</li>
          ))}
        </ul>
      </Card>
    </CardGrid>
  );
}
