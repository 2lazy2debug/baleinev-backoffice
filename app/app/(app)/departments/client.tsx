"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { Button, Card, CardGrid, Field, IconButton, Input } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import { createDepartmentAction, deleteDepartmentAction } from "./actions";

type DepartmentItem = {
  id: string;
  name: string;
  _count: { budgetLines: number; journalEntries: number };
};

export function DepartmentsPageClient({ departments }: { departments: DepartmentItem[] }) {
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteDepartmentAction, initialActionState);
  const [createState, createFormAction, isCreating] = useActionState(createDepartmentAction, initialActionState);
  const isReadOnly = useEditionReadOnly();

  return (
    <section className={isReadOnly ? "grid gap-6" : "grid gap-6 xl:grid-cols-[1fr_360px]"}>
      <div>
        <FormError message={deleteState.error} />
        {departments.length === 0 ? (
          <Card span="full" dashed>
            No departments yet for this edition.
          </Card>
        ) : (
          <CardGrid>
            {departments.map((department) => (
              <Card key={department.id} as="article" span="1/2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{department.name}</h2>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      {department._count.budgetLines} budget lines, {department._count.journalEntries} journal entries
                    </p>
                  </div>

                  {isReadOnly ? null : (
                    <form action={deleteFormAction}>
                      <input type="hidden" name="departmentId" value={department.id} />
                      <IconButton type="submit" tone="delete" label="Delete" disabled={isDeleting}>
                        <Trash2 />
                      </IconButton>
                    </form>
                  )}
                </div>
              </Card>
            ))}
          </CardGrid>
        )}
      </div>

      {isReadOnly ? null : (
      <div>
        <Card as="section">
          <h2 className="text-xl font-semibold">Create a department</h2>
          <form action={createFormAction} className="mt-6 space-y-4">
            <FormError message={createState.error} />
            <Field label="Department name">
              <Input type="text" name="name" placeholder="PROGRAMMATION" required />
            </Field>

            <Button type="submit" variant="primary" disabled={isCreating}>
              Add department
            </Button>
          </form>
        </Card>
      </div>
      )}
    </section>
  );
}
