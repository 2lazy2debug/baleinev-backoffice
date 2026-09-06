"use client";

import { Field, Input, MultiSelect } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

type Props = {
  locale: Locale;
  /** Every department — any of them may be attached to a budget. */
  departments: { id: string; name: string }[];
  /** Prefilled when the form is editing an existing budget. */
  budget?: { name: string; departmentIds: string[] };
};

/**
 * The fields a budget is — a name and the departments that get to see it.
 * Creating and editing ask for exactly the same thing, so they share one set
 * rather than drifting into two. Selecting no department is valid: that budget
 * is then visible to admins only.
 */
export function BudgetFormFields({ locale, departments, budget }: Props) {
  const copy = dictionaries[locale].budget;

  return (
    <>
      <Field label={copy.budgetName}>
        <Input type="text" name="name" defaultValue={budget?.name ?? ""} required autoFocus />
      </Field>

      <div className="space-y-1.5">
        <Field label={copy.budgetDepartments}>
          <MultiSelect
            name="departmentIds"
            defaultValue={budget?.departmentIds ?? []}
            rows={Math.max(departments.length, 3)}
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </MultiSelect>
        </Field>
        <p className="text-xs text-[var(--muted)]">{copy.budgetDepartmentsHint}</p>
      </div>
    </>
  );
}
