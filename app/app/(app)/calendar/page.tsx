import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { getPendingTasksForUser } from "@/lib/tasks";

import { deleteAppointmentAction, updateAppointmentAction } from "./actions";
import { WritableEditionOnly } from "@/components/edition-read-only";

import CalendarPageClient from "./client";
import { CreateAppointmentForm } from "./create-appointment-form";
import { EmptyPage } from "@/components/ui";

export default async function CalendarPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
    include: {
      departments: { orderBy: { name: "asc" } },
    },
  }) : null;

  if (!activeEdition) {
    return (
      <EmptyPage eyebrow={copy.calendar.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  const departmentIdsForUser = activeEdition.departments
    .filter((department) => access.departmentRoleNames.includes(department.name))
    .map((department) => department.id);

  const [pendingTasks, appointments, users] = await Promise.all([
    getPendingTasksForUser(access),
    prisma.appointment.findMany({
      where: {
        editionId: activeEdition.id,
        ...(access.role === "ADMIN"
          ? {}
          : {
            OR: [
              { inviteAll: true },
              { inviteUsers: { some: { userId: access.id } } },
              { inviteDepartments: { some: { departmentId: { in: departmentIdsForUser } } } },
            ],
          }),
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        createdById: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
      },
    }),
    access.role === "ADMIN"
      ? prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <CalendarPageClient
        copy={copy.calendar}
        currentUserId={access.id}
        updateAppointmentAction={updateAppointmentAction}
        deleteAppointmentAction={deleteAppointmentAction}
        tasks={pendingTasks
          .filter((task) => Boolean(task.dueDate))
          .map((task) => ({
            id: task.id,
            title: task.title,
            dueDate: task.dueDate!.toISOString(),
            href: task.type === "STAFF_SHIFT" ? "/events" : "/tasks",
          }))}
        appointments={appointments.map((appointment) => ({
          id: appointment.id,
          createdById: appointment.createdById,
          title: appointment.title,
          description: appointment.description,
          startAt: appointment.startAt.toISOString(),
          endAt: appointment.endAt ? appointment.endAt.toISOString() : null,
        }))}
      />

      {access.role === "ADMIN" ? (
        <WritableEditionOnly>
          <CreateAppointmentForm copy={copy.calendar} users={users} departments={activeEdition.departments} />
        </WritableEditionOnly>
      ) : null}
    </div>
  );
}
