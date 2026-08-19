import { WritableEditionOnly } from "@/components/edition-read-only";
import { TasksCreateModal } from "@/components/tasks-create-modal";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
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
      <PageHeader
        eyebrow={copy.tasks.title}
        title={copy.tasks.title}
        description={copy.tasks.subtitle}
        actions={
          <WritableEditionOnly>
            <TasksCreateModal
              copy={copy.tasks}
              users={users}
              isAdmin={access.role === "ADMIN"}
              createTodoAction={createTodoAction}
              createTodoTaskAction={createTodoTaskAction}
            />
          </WritableEditionOnly>
        }
      />

      <Card as="section" className="space-y-5">
        <SectionTitle>{copy.tasks.allTasks}</SectionTitle>
        <TasksPageClient
          todos={todos}
          ungroupedTasks={ungroupedTasks}
          access={access}
          copy={copy}
          locale={locale}
          users={users}
          activeEdition={editionId ? { id: editionId } : null}
        />
      </Card>
    </div>
  );
}
