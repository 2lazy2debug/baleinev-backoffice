"use client";

import { Checkbox, Field, Input } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

type Props = {
  locale: Locale;
  /** Prefilled when the form is editing an existing department. */
  department?: { name: string; abbreviation: string | null; hasBudget: boolean };
};

/**
 * The three fields a department is. Creating and editing ask for exactly the
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

      <div className="space-y-1.5">
        <Checkbox
          id="department-has-budget"
          name="hasBudget"
          label={copy.hasBudget}
          defaultChecked={department?.hasBudget ?? false}
        />
        <p className="text-xs text-[var(--muted)]">{copy.hasBudgetHint}</p>
      </div>
    </>
  );
}
