import { prisma } from "@/lib/db";

import { DepartmentsPageClient } from "./client";

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

      <DepartmentsPageClient departments={activeEdition.departments} />
    </div>
  );
}