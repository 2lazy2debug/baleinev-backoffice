"use client";

import { useEffect, useState } from "react";
import { TaskType } from "@prisma/client";
import { Check, Circle, Pencil, Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { buttonClasses } from "@/lib/button-classes";
import { decimalToNumber, formatCurrency } from "@/lib/utils";

import {
  createTodoTaskAction,
  deleteTodoAction,
  deleteTodoTaskAction,
  resolveTaskAction,
  setTodoTaskStatusAction,
  updateTodoAction,
  updateTodoTaskAction,
} from "./actions";

function TaskTypeLabel({
  type,
  copy,
}: {
  type: TaskType;
  copy: { generalTask: string; reviewExpenseReport: string; recordJournal: string; staffShift: string };
}) {
  const labels: Record<TaskType, string> = {
    GENERAL: copy.generalTask,
    REVIEW_EXPENSE_REPORT: copy.reviewExpenseReport,
    RECORD_JOURNAL: copy.recordJournal,
    STAFF_SHIFT: copy.staffShift,
  };

  return <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{labels[type]}</span>;
}

interface TasksPageClientProps {
  todos: TodoItem[];
  ungroupedTasks: StandaloneTask[];
  access: UserAccess;
  copy: any;
  locale: string;
  users: UserSummary[];
  activeEdition: { id: string } | null;
  permissionError?: boolean;
}

interface UserSummary {
  id: string;
  name: string;
}

interface UserAccess {
  id: string;
  role: "ADMIN" | "DEPARTMENT";
}

interface ExpenseReportSummary {
  id: string;
  description: string;
  amount: { toString(): string } | number | null;
}

interface EventSummary {
  name: string;
}

interface EventDaySummary {
  date: Date | string;
  event: EventSummary | null;
}

interface ShiftSummary {
  role: string | null;
  startTime: string;
  endTime: string;
  eventDay: EventDaySummary | null;
}

interface StaffAssignmentSummary {
  shift: ShiftSummary | null;
}

interface TodoTaskItem {
  id: string;
  title: string;
  description: string | null;
  status: "PENDING" | "DONE";
  dueDate: Date | string | null;
  assignedToUser: UserSummary | null;
}

interface TodoItem {
  id: string;
  title: string;
  description: string | null;
  createdById: string;
  assignedToUserId: string | null;
  assignedToUser: UserSummary | null;
  tasks: TodoTaskItem[];
}

interface StandaloneTask {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  status: "PENDING" | "DONE";
  dueDate: Date | string | null;
  createdById: string | null;
  assignedToUserId: string | null;
  assignedToUser: UserSummary | null;
  expenseReport: ExpenseReportSummary | null;
  staffAssignment: StaffAssignmentSummary | null;
}

export function TasksPageClient({
  todos,
  ungroupedTasks,
  access,
  copy,
  locale,
  users,
  activeEdition,
  permissionError,
}: TasksPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!permissionError) {
      return;
    }

    const message =
      locale === "fr"
        ? "Vous n'avez pas la permission de modifier ou supprimer cette tache."
        : "You do not have permission to edit or delete this task.";

    window.alert(message);
    router.replace(pathname);
  }, [locale, pathname, permissionError, router]);

  if (!activeEdition) {
    return <p className="text-sm text-[var(--muted)]">{copy.common.noActiveEdition}</p>;
  }

  if (todos.length === 0 && ungroupedTasks.length === 0) {
    return <p className="text-sm text-[var(--muted)]">{copy.tasks.noPendingTasks}</p>;
  }

  return (
    <div className="space-y-4">
      {todos.map((todo) => (
        <TodoCard
          key={todo.id}
          todo={todo}
          users={users}
          isAdmin={access.role === "ADMIN"}
          access={access}
          copy={copy}
          locale={locale}
        />
      ))}

      {ungroupedTasks.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h3 className="text-sm font-semibold">{copy.tasks.standaloneTasks}</h3>
          {ungroupedTasks.map((task) => {
            const expenseReport = task.expenseReport;
            const shift = task.staffAssignment?.shift;
            const eventDay = shift?.eventDay;
            const event = eventDay?.event;
            const isGeneral = task.type === "GENERAL";
            const canManageTask = task.createdById === access.id;

            return (
              <div key={task.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <TaskTypeLabel type={task.type} copy={copy.tasks} />

                {isGeneral ? (
                  <>
                    {canManageTask ? (
                      <form action={updateTodoTaskAction} className="mt-2 grid gap-2 md:grid-cols-2">
                        <input type="hidden" name="todoTaskId" value={task.id} />
                        <input
                          type="text"
                          name="title"
                          required
                          defaultValue={task.title}
                          className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                        />
                        <input
                          type="datetime-local"
                          name="dueDate"
                          defaultValue={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : ""}
                          className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                        />
                        <textarea
                          name="description"
                          rows={2}
                          defaultValue={task.description ?? ""}
                          className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] md:col-span-2"
                        />
                        {access.role === "ADMIN" ? (
                          <select
                            name="assignedToUserId"
                            defaultValue={task.assignedToUserId ?? ""}
                            className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] md:col-span-2"
                          >
                            <option value="">{copy.tasks.unassigned}</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <div className="md:col-span-2">
                          <button className={buttonClasses.text.primary}>
                            {copy.tasks.saveTask}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="mt-2 space-y-1">
                        <p className="font-medium break-words">{task.title}</p>
                        {task.description ? (
                          <p className="text-sm text-[var(--muted)] whitespace-pre-wrap break-words">{task.description}</p>
                        ) : null}
                        {task.dueDate ? (
                          <p className="text-xs text-[var(--muted)]">
                            {new Date(task.dueDate).toLocaleString(locale === "fr" ? "fr-CH" : "en-CH")}
                          </p>
                        ) : null}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <span>
                        {copy.tasks.statusLabel}: {task.status === "DONE" ? copy.tasks.done : copy.tasks.pending}
                      </span>
                      <span>•</span>
                      <span>
                        {copy.tasks.assignedTo}: {task.assignedToUser?.name ?? copy.tasks.unassigned}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <form action={setTodoTaskStatusAction}>
                        <input type="hidden" name="todoTaskId" value={task.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={task.status === "DONE" ? "PENDING" : "DONE"}
                        />
                        <button className={buttonClasses.text.primary}>
                          {task.status === "DONE" ? copy.tasks.markPending : copy.tasks.markDone}
                        </button>
                      </form>
                      {canManageTask ? (
                        <form action={deleteTodoTaskAction}>
                          <input type="hidden" name="todoTaskId" value={task.id} />
                          <button className={buttonClasses.text.delete}>
                            {copy.tasks.deleteTask}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 font-medium">
                      {task.type === "STAFF_SHIFT" && shift ? `Shift: ${shift.role || copy.tasks.staffShift}` : task.title}
                    </p>
                    {expenseReport ? (
                      <p className="text-xs text-[var(--muted)]">
                        {copy.tasks.linkedTo}:{" "}
                        <a href="/expense-reports" className="underline hover:text-[var(--ink)]">
                          {expenseReport.description} — {formatCurrency(decimalToNumber(expenseReport.amount))}
                        </a>
                      </p>
                    ) : null}
                    {task.type === "RECORD_JOURNAL" && expenseReport ? (
                      <a
                        href={`/journal?fromExpenseReport=${expenseReport.id}`}
                        className="inline-block text-xs font-semibold text-[var(--accent)] hover:underline"
                      >
                        → {copy.tasks.recordJournal}
                      </a>
                    ) : null}
                    {shift && event && eventDay ? (
                      <p className="text-xs text-[var(--muted)]">
                        {event.name} —{" "}
                        {new Date(eventDay.date).toLocaleDateString(
                          locale === "fr" ? "fr-CH" : "en-CH"
                        )}{" "}
                        {shift.startTime}–{shift.endTime}
                      </p>
                    ) : null}
                    {task.dueDate ? (
                      <p className="text-xs text-[var(--muted)]">
                        {new Date(task.dueDate).toLocaleString(locale === "fr" ? "fr-CH" : "en-CH")}
                      </p>
                    ) : null}

                    <form action={resolveTaskAction} className="mt-2">
                      <input type="hidden" name="taskId" value={task.id} />
                      <button className={buttonClasses.text.primary}>
                        {copy.tasks.markDone}
                      </button>
                    </form>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

interface TodoCardProps {
  todo: TodoItem;
  users: UserSummary[];
  isAdmin: boolean;
  access: UserAccess;
  copy: any;
  locale: string;
}

function TodoCard({ todo, users, isAdmin, access, copy, locale }: TodoCardProps) {
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [deletingTodoId, setDeletingTodoId] = useState<string | null>(null);
  const canManageTodoTasks = todo.createdById === access.id;

  const isEditing = editingTodoId === todo.id;
  const isDeleting = deletingTodoId === todo.id;

  return (
    <article className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      {isEditing ? (
        <form action={updateTodoAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="todoId" value={todo.id} />
          <label className="block space-y-1 md:col-span-2">
            <span className="text-sm font-medium">{copy.tasks.todoTitle}</span>
            <input
              type="text"
              name="title"
              required
              defaultValue={todo.title}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-sm font-medium">{copy.tasks.todoDescription}</span>
            <textarea
              name="description"
              rows={2}
              defaultValue={todo.description ?? ""}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          {isAdmin ? (
            <label className="block space-y-1 md:col-span-2">
              <span className="text-sm font-medium">{copy.tasks.assignTodoTo}</span>
              <select
                name="assignedToUserId"
                defaultValue={todo.assignedToUserId ?? ""}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              >
                <option value="">{copy.tasks.unassigned}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="md:col-span-2 flex gap-2">
            <button className={buttonClasses.text.primary}>
              {copy.tasks.saveTodo}
            </button>
            <button
              type="button"
              onClick={() => setEditingTodoId(null)}
              className={buttonClasses.text.cancel}
            >
              {copy.common.cancel ?? "Cancel"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold break-words">{todo.title}</h3>
            {todo.description ? (
              <p className="mt-1 text-sm text-[var(--muted)] whitespace-pre-wrap break-words">
                {todo.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-[var(--muted)]">
              {copy.tasks.assignedTo}: {todo.assignedToUser?.name ?? copy.tasks.unassigned}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {isAdmin && todo.createdById === access.id ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditingTodoId(todo.id)}
                  className={buttonClasses.icon.edit}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingTodoId(todo.id)}
                  className={buttonClasses.icon.delete}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {isDeleting ? (
        <form
          action={deleteTodoAction}
          className="grid gap-2 rounded-xl border border-dashed border-rose-400/50 bg-rose-950/20 p-3 md:grid-cols-[1fr_auto]"
        >
          <input type="hidden" name="todoId" value={todo.id} />
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-300">
              {copy.tasks.typeDeleteToConfirm}
            </span>
            <input
              type="text"
              name="confirmDelete"
              required
              placeholder="delete"
              autoFocus
              className="w-full rounded-xl border border-rose-300 bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:bg-[var(--panel)]"
            />
          </label>
          <div className="flex items-end gap-2">
            <button className={buttonClasses.text.delete}>
              {copy.tasks.delete}
            </button>
            <button
              type="button"
              onClick={() => setDeletingTodoId(null)}
              className={buttonClasses.text.cancel}
            >
              {copy.common.cancel ?? "Cancel"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-3">
        <p className="text-sm font-semibold">{copy.tasks.todoTasks}</p>

        {canManageTodoTasks ? (
          <form action={createTodoTaskAction} className="grid gap-2 md:grid-cols-2">
            <input type="hidden" name="todoId" value={todo.id} />
            <input
              type="text"
              name="title"
              required
              placeholder={copy.tasks.taskTitle}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <input
              type="datetime-local"
              name="dueDate"
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <textarea
              name="description"
              rows={2}
              placeholder={copy.tasks.taskDescription}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] md:col-span-2"
            />
            {isAdmin ? (
              <select
                name="assignedToUserId"
                defaultValue=""
                className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] md:col-span-2"
              >
                <option value="">{copy.tasks.unassigned}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="md:col-span-2">
              <button className={buttonClasses.text.primary}>
                {copy.tasks.createTask}
              </button>
            </div>
          </form>
        ) : null}

        {todo.tasks.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">{copy.tasks.noTasks}</p>
        ) : (
          <ul className="space-y-2">
            {todo.tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{task.title}</p>
                  {task.description ? (
                    <p className="mt-0.5 text-xs text-[var(--muted)] line-clamp-2">{task.description}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                    <span>{task.status === "DONE" ? copy.tasks.done : copy.tasks.pending}</span>
                    {task.assignedToUser?.name && (
                      <>
                        <span>•</span>
                        <span>{task.assignedToUser.name}</span>
                      </>
                    )}
                    {task.dueDate && (
                      <>
                        <span>•</span>
                        <span>
                          {new Date(task.dueDate).toLocaleDateString(
                            locale === "fr" ? "fr-CH" : "en-CH"
                          )}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <form action={setTodoTaskStatusAction} className="inline">
                    <input type="hidden" name="todoTaskId" value={task.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={task.status === "DONE" ? "PENDING" : "DONE"}
                    />
                    <button
                      className={buttonClasses.icon.action}
                      title={
                        task.status === "DONE" ? "Mark pending" : "Mark done"
                      }
                    >
                      {task.status === "DONE" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Circle className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </form>
                  {canManageTodoTasks ? (
                    <>
                      <form action={updateTodoTaskAction} className="inline">
                        <input type="hidden" name="todoTaskId" value={task.id} />
                        <button
                          className={buttonClasses.icon.edit}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </form>
                      <form action={deleteTodoTaskAction} className="inline">
                        <input type="hidden" name="todoTaskId" value={task.id} />
                        <button
                          className={buttonClasses.icon.delete}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
