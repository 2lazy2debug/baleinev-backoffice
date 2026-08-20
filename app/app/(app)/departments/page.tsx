import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";

import { DepartmentsPageClient } from "./client";
import { EmptyPage, PageHeader } from "@/components/ui";

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
      <EmptyPage eyebrow="Departments" title="No edition selected">
        Pick an edition before you start organizing departments.
      </EmptyPage>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Departments"
        title={<>Budget departments for {activeEdition.name}</>}
        description="Manage the structural budget categories used by this edition, including SANS EFFET."
      />

      <DepartmentsPageClient departments={activeEdition.departments} />
    </div>
  );
}