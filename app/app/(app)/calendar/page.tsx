import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { getPendingTasksForUser } from "@/lib/tasks";

import { createAppointmentAction, deleteAppointmentAction, updateAppointmentAction } from "./actions";
import CalendarPageClient from "./client";

export default async function CalendarPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const activeEdition = await prisma.edition.findFirst({
    where: { isActive: true },
    include: {
      departments: { orderBy: { name: "asc" } },
    },
  });

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.calendar.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noActiveEdition}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">{copy.common.createAndActivateEdition}</p>
      </div>
    );
  }

  const departmentIdsForUser = activeEdition.departments
    .filter((department) => access.departmentRoleNames.includes(department.name))
    .map((department) => department.id);

  const appointmentDelegate = (prisma as unknown as {
    appointment?: {
      findMany: (args: unknown) => Promise<Array<{
        id: string;
        createdById: string;
        title: string;
        description: string;
        startAt: Date;
        endAt: Date | null;
      }>>;
    };
  }).appointment;

  const [pendingTasks, appointments, users] = await Promise.all([
    getPendingTasksForUser(access),
    appointmentDelegate
      ? appointmentDelegate.findMany({
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
      })
      : Promise.resolve([]),
    access.role === "ADMIN"
      ? prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
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
        <section className="rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
          <h2 className="text-lg font-semibold">{copy.calendar.createAppointment}</h2>
          <form action={createAppointmentAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block space-y-1 md:col-span-2">
              <span className="text-sm font-medium">{copy.calendar.appointmentTitle}</span>
              <input
                type="text"
                name="title"
                required
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="block space-y-1 md:col-span-2">
              <span className="text-sm font-medium">{copy.calendar.appointmentDescription}</span>
              <textarea
                name="description"
                rows={3}
                required
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">{copy.calendar.startsAt}</span>
              <input
                type="datetime-local"
                name="startAt"
                required
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">{copy.calendar.endsAtOptional}</span>
              <input
                type="datetime-local"
                name="endAt"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            <div className="md:col-span-2 space-y-1">
              <span className="text-sm font-medium">{copy.calendar.audience}</span>
              <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                <summary className="cursor-pointer px-3 py-2 text-sm text-[var(--muted)]">{copy.calendar.audienceHelp}</summary>
                <div className="max-h-56 space-y-2 overflow-y-auto border-t border-[var(--line)] px-3 py-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="audience" value="@everyone" />
                    <span>@everyone</span>
                  </label>
                  <p className="pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{copy.calendar.person}</p>
                  {users.map((user) => (
                    <label key={user.id} className="flex items-center gap-2">
                      <input type="checkbox" name="audience" value={`user:${user.id}`} />
                      <span>{user.name}</span>
                    </label>
                  ))}
                  <p className="pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{copy.calendar.department}</p>
                  {activeEdition.departments.map((department) => (
                    <label key={department.id} className="flex items-center gap-2">
                      <input type="checkbox" name="audience" value={`department:${department.id}`} />
                      <span>@{department.name.toLowerCase()}</span>
                    </label>
                  ))}
                </div>
              </details>
              <p className="text-xs text-[var(--muted)]">{copy.calendar.noAudienceMeansPrivate}</p>
            </div>

            <div className="md:col-span-2">
              <button className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
                {copy.calendar.submitAppointment}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
