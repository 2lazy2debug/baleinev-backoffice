import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";

import { createDepartmentAction, deleteDepartmentAction } from "./actions";

export default async function DepartmentsPage() {
  const activeEdition = await prisma.edition.findFirst({
    where: { isActive: true },
    include: {
      departments: {
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: { budgetLines: true, journalEntries: true },
          },
        },
      },
    },
  });

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Departments</p>
        <h1 className="text-3xl font-semibold tracking-tight">No active edition</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
          Create an edition and make it active before you start organizing departments.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Departments</p>
        <h1 className="text-3xl font-semibold tracking-tight">Budget departments for {activeEdition.name}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">
          Manage the structural budget categories used by this edition, including SANS EFFET.
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4 md:grid-cols-2">
          {activeEdition.departments.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[var(--line)] bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)] md:col-span-2">
              No departments yet for this edition.
            </div>
          ) : (
            activeEdition.departments.map((department) => (
              <article key={department.id} className="rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{department.name}</h2>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      {department._count.budgetLines} budget lines, {department._count.journalEntries} journal entries
                    </p>
                  </div>

                  <form action={deleteDepartmentAction}>
                    <input type="hidden" name="departmentId" value={department.id} />
                    <button title="Delete" className="rounded-full border border-rose-300 p-2 text-rose-300 hover:bg-rose-950/40">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>
              </article>
            ))
          )}
        </div>

        <section className="rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-6">
          <h2 className="text-xl font-semibold">Create a department</h2>
          <form action={createDepartmentAction} className="mt-6 space-y-4">
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

            <button className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
              Add department
            </button>
          </form>
        </section>
      </section>
    </div>
  );
}