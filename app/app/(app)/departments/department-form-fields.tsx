"use client";

import { Field, Input } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

type Props = {
  locale: Locale;
  /** Prefilled when the form is editing an existing department. */
  department?: { name: string; abbreviation: string | null };
};

/**
 * The two fields a department is. Creating and editing ask for exactly the
 * same thing, so they share one set rather than drifting into two.
 */
export function DepartmentFormFields({ locale, department }: Props) {
  const copy = dictionaries[locale].departments;

  return (
    <>
      <Field label={copy.name}>
        <Input type="text" name="name" defaultValue={department?.name ?? ""} required autoFocus />
      </Field>

      <Field label={copy.abbreviationOptional}>
        <Input type="text" name="abbreviation" defaultValue={department?.abbreviation ?? ""} maxLength={12} />
      </Field>
    </>
  );
}
