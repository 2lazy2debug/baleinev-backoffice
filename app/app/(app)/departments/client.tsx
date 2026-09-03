"use client";

import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  Cardlet,
  CardletActions,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  IconButton,
  Modal,
  Panel,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { deleteDepartmentAction, updateDepartmentAction } from "./actions";
import { DepartmentFormFields } from "./department-form-fields";

export type DepartmentRow = {
  id: string;
  name: string;
  abbreviation: string | null;
  hasBudget: boolean;
  /** How many accounts belong to it — what an admin reads this list for. */
  peopleCount: number;
};

const EDIT_FORM_ID = "edit-department-form";
const DELETE_FORM_ID = "delete-department-form";

/**
 * The departments, as a table on a desktop and as cardlets on a phone — both fed
 * by the one array, so neither can drift into a second reading of "has a budget".
 *
 * Editing is a dialog rather than an unlocked row: a department is named by the
 * budget, the journal, the vault and everyone's account, so renaming it is not a
 * gesture to make by accident.
 */
export function DepartmentsClient({ locale, departments }: { locale: Locale; departments: DepartmentRow[] }) {
  const copy = dictionaries[locale].departments;
  const shellCopy = dictionaries[locale].shell;

  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);

  const [editState, editFormAction, isSaving] = useActionState(updateDepartmentAction, initialActionState);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteDepartmentAction, initialActionState);
  const markEditSubmitted = useCloseOnSuccess(editState, isSaving, () => setEditing(null));
  const markDeleteSubmitted = useCloseOnSuccess(deleteState, isDeleting, () => setDeleting(null));

  const budgetBadge = (department: DepartmentRow, standalone: boolean) => (
    <Badge tone={department.hasBudget ? "info" : "neutral"}>
      {department.hasBudget
        ? (standalone ? copy.budgetOn : copy.budgetYes)
        : (standalone ? copy.budgetOff : copy.budgetNo)}
    </Badge>
  );

  if (departments.length === 0) {
    return (
      <CardGrid>
        <Card span="full" dashed>{copy.empty}</Card>
      </CardGrid>
    );
  }

  return (
    <>
      <Panel flushOnMobile as="div" className="bg-[var(--panel)]">
        <Table desktopOnly frame={false}>
          <THead>
            <TR>
              <TH>{copy.name}</TH>
              <TH>{copy.abbreviation}</TH>
              <TH>{copy.budget}</TH>
              <TH className="text-right">{copy.people}</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {departments.map((department) => (
              <TR key={department.id}>
                <TD className="font-medium">{department.name}</TD>
                <TD className="text-[var(--muted)]">{department.abbreviation ?? "—"}</TD>
                <TD>{budgetBadge(department, false)}</TD>
                <TD className="text-right tabular-nums">{department.peopleCount}</TD>
                <TD>
                  <div className="flex items-center justify-end gap-2">
                    <IconButton size="sm" tone="accent" label={copy.edit} onClick={() => setEditing(department)}>
                      <Pencil />
                    </IconButton>
                    <IconButton size="sm" tone="delete" label={copy.delete} onClick={() => setDeleting(department)}>
                      <Trash2 />
                    </IconButton>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>

        <CardletList>
          {departments.map((department) => (
            <Cardlet key={department.id}>
              <CardletHeader title={department.name} action={budgetBadge(department, true)} />
              <CardletFields>
                <CardletField label={copy.abbreviation}>{department.abbreviation ?? "—"}</CardletField>
                <CardletField label={copy.people}>{department.peopleCount}</CardletField>
              </CardletFields>
              <CardletActions inline>
                <IconButton tone="accent" label={copy.edit} onClick={() => setEditing(department)}>
                  <Pencil />
                </IconButton>
                <IconButton tone="delete" label={copy.delete} onClick={() => setDeleting(department)}>
                  <Trash2 />
                </IconButton>
              </CardletActions>
            </Cardlet>
          ))}
        </CardletList>
      </Panel>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={copy.edit}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form={EDIT_FORM_ID} variant="primary" disabled={isSaving}>
              {copy.save}
            </Button>
          </>
        }
      >
        {/* `key` rebuilds the uncontrolled fields when another row is opened, so
            the dialog never shows the previous department's values. */}
        <form
          key={editing?.id}
          id={EDIT_FORM_ID}
          action={editFormAction}
          onSubmit={markEditSubmitted}
          className="space-y-4"
        >
          <FormError message={editState.error} />
          <input type="hidden" name="departmentId" value={editing?.id ?? ""} />
          {editing ? <DepartmentFormFields locale={locale} department={editing} /> : null}
        </form>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={copy.delete}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form={DELETE_FORM_ID} variant="destructive" disabled={isDeleting}>
              {copy.delete}
            </Button>
          </>
        }
      >
        <form id={DELETE_FORM_ID} action={deleteFormAction} onSubmit={markDeleteSubmitted} className="space-y-4">
          <FormError message={deleteState.error} />
          <input type="hidden" name="departmentId" value={deleting?.id ?? ""} />

          <p className="text-sm font-medium">{deleting?.name}</p>
          <p className="text-sm text-[var(--muted)]">{copy.deleteConfirm}</p>
        </form>
      </Modal>
    </>
  );
}
