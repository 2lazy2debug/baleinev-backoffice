"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
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
      <div className="grid gap-4 md:grid-cols-2">
        <FormError message={deleteState.error} className="md:col-span-2" />
        {departments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)] md:col-span-2">
            No departments yet for this edition.
          </div>
        ) : (
          departments.map((department) => (
            <article key={department.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5">
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
                    <button
                      disabled={isDeleting}
                      title="Delete"
                      className="rounded-md border border-rose-300 p-2 text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {isReadOnly ? null : (
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
        <h2 className="text-xl font-semibold">Create a department</h2>
        <form action={createFormAction} className="mt-6 space-y-4">
          <FormError message={createState.error} />
          <label className="block space-y-2">
            <span className="text-sm font-medium">Department name</span>
            <input
              type="text"
              name="name"
              placeholder="PROGRAMMATION"
              required
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <button
            disabled={isCreating}
            className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            Add department
          </button>
        </form>
      </section>
      )}
    </section>
  );
}
