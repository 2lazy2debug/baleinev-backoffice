import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";

import { DepartmentsPageClient } from "./client";

export default async function DepartmentsPage() {
  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
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
  }) : null;

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Departments</p>
        <h1 className="text-3xl font-semibold tracking-tight">No edition selected</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
          Pick an edition in the sidebar before you start organizing departments.
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