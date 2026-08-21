# Example: Expense Reports converted

Highest-complexity case in scope — a permanent side-by-side create form on desktop, and a dedicated Create/History tab strip on mobile (`tabs.tsx`). Converting this one demonstrates the pattern for every other app in scope.

## 1. Delete `tabs.tsx`

`ExpenseReportsTabs` existed only to switch between the create form and the history below `lg`. Once create is a modal there's nothing to switch between — delete the file and its usage in `page.tsx`.

## 2. New file: `create-expense-report-modal.tsx`

Same shape as `components/tasks-create-modal.tsx`: a client component holding the trigger `Button` and the `Modal`, reading its own `useActionState`. It replaces `create-expense-report-form.tsx`'s own `Card`/`SectionTitle` wrapper — the `Modal` supplies the chrome now — but keeps every field exactly as it is today.

```tsx
"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { Alert, Button, Field, Input, Modal, Select } from "@/components/ui";
import { allowedProofMimeTypes } from "@/lib/proof-upload";
import { initialActionState } from "@/lib/server-action-helpers";

import { createExpenseReportAction } from "./actions";

// ...same Props / Copy / EXPENSE_REPORT_TYPE / EXPENSE_PAYMENT_METHOD as today's create-expense-report-form.tsx

export default function CreateExpenseReportModal({ departments, drivingRatePerKm, copy }: Props) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ExpenseReportTypeValue>(EXPENSE_REPORT_TYPE.STANDARD);
  const [kilometers, setKilometers] = useState("");
  const [createState, createFormAction, isCreating] = useActionState(createExpenseReportAction, initialActionState);

  const computedAmount = useMemo(() => {
    const km = Number(kilometers.replace(",", "."));
    if (!Number.isFinite(km) || km <= 0) return 0;
    return Number((km * drivingRatePerKm).toFixed(2));
  }, [kilometers, drivingRatePerKm]);

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <Plus />
        {copy.create}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.create}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" form="expense-report-form" variant="primary" disabled={isCreating}>
              {copy.submit}
            </Button>
          </>
        }
      >
        {/* identical field markup to today's create-expense-report-form.tsx,
            just without the outer <Card>/<SectionTitle> and with id="expense-report-form"
            on the <form> so the footer's submit button can target it */}
        <form id="expense-report-form" action={createFormAction} className="space-y-4">
          <FormError message={createState.error} />
          {/* reportType Select, description/amount or driving fields, payment method,
              date, proof upload, department Select — unchanged from today */}
        </form>
      </Modal>
    </>
  );
}
```

Note the footer pattern: the submit button lives in `Modal`'s `footer`, targeting the form by `id` (`form="expense-report-form"`) — the same technique already used in `invoices/client.tsx` and `passwords/client.tsx`'s `EntryDialog`. This keeps Cancel/Submit visually consistent across every modal in the app.

## 3. `page.tsx`: current → new

**Current** — `ExpenseReportsTabs` owns the header and the create/history split:

```tsx
return (
  <div className="space-y-8">
    <ExpenseReportsTabs
      eyebrow={copy.expenseReports.title}
      title={<>{copy.expenseReports.title} {activeEdition.name}</>}
      description={copy.expenseReports.subtitle}
      copy={{ history: copy.expenseReports.history, newReport: copy.expenseReports.newReport }}
      create={
        <WritableEditionOnly>
          <CreateExpenseReportForm departments={...} drivingRatePerKm={...} copy={{...}} />
        </WritableEditionOnly>
      }
      history={<ExpenseReportsPageClient expenseReports={...} access={...} copy={copy} />}
    />
  </div>
);
```

**New** — a plain `PageHeader` with the modal in `actions`, then just the history:

```tsx
import { PageHeader } from "@/components/ui";
import CreateExpenseReportModal from "./create-expense-report-modal";

return (
  <div className="space-y-8">
    <PageHeader
      eyebrow={copy.expenseReports.title}
      title={<>{copy.expenseReports.title} {activeEdition.name}</>}
      description={copy.expenseReports.subtitle}
      actions={
        <WritableEditionOnly>
          <CreateExpenseReportModal
            departments={activeEdition.departments
              .filter((department) => access.role === "ADMIN" || access.departmentRoleNames.includes(department.name))
              .map((department) => ({ id: department.id, name: department.name }))}
            drivingRatePerKm={decimalToNumber(activeEdition.drivingRatePerKm)}
            copy={{ /* same copy object passed today, plus copy.cancel */ }}
          />
        </WritableEditionOnly>
      }
    />

    <ExpenseReportsPageClient
      expenseReports={activeEdition.expenseReports}
      access={{ role: access.role }}
      copy={copy}
    />
  </div>
);
```

## 4. `client.tsx` (history) — no change

`ExpenseReportsPageClient` already renders the desktop table + mobile cardlets from one `rows` array (see its comment: "the two views must never compute a status... of their own"). It doesn't know about the create form today and doesn't need to know about the modal either — leave it exactly as is.

## Result

- Desktop: title + "New expense report" button, top-right → opens the modal. Below it, the history table, full width (no more `xl:grid-cols-[420px_1fr]` split).
- Mobile: same title + button in the top bar → opens the same modal, full-screen. Below it, the history cardlets. No Create/History segmented control.
- Permission gating unchanged: `WritableEditionOnly` still hides the whole button (and now, implicitly, the whole create flow) in a closed edition — on both breakpoints, since it's the same `PageHeader actions` render.
