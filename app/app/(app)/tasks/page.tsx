import { TasksCreateModal } from "@/components/tasks-create-modal";
import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { getStandaloneTodoTasksForUser, getVisibleTodosForUser } from "@/lib/tasks";

import { TasksPageClient } from "./client";
import { createTodoAction, createTodoTaskAction } from "./actions";

export default async function TasksPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const [editionId, users, ungroupedTasks] = await Promise.all([
    resolveEditionIdOrNull(),
    access.role === "ADMIN"
      ? prisma.user.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    getStandaloneTodoTasksForUser({ userId: access.id, role: access.role }),
  ]);

  const todos = editionId
    ? await getVisibleTodosForUser({
        userId: access.id,
        editionId,
      })
    : [];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          {copy.tasks.title}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {copy.tasks.title}
        </h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">
          {copy.tasks.subtitle}
        </p>
        <TasksCreateModal
          copy={copy.tasks}
          users={users}
          isAdmin={access.role === "ADMIN"}
          createTodoAction={createTodoAction}
          createTodoTaskAction={createTodoTaskAction}
        />
      </header>

      <section className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
        <h2 className="text-xl font-semibold">{copy.tasks.allTasks}</h2>
        <TasksPageClient
          todos={todos}
          ungroupedTasks={ungroupedTasks}
          access={access}
          copy={copy}
          locale={locale}
          users={users}
          activeEdition={editionId ? { id: editionId } : null}
        />
      </section>
    </div>
  );
}
