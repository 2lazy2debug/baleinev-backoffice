"use client";

import { useActionState, useState } from "react";
import { TaskType } from "@prisma/client";
import { Check, Circle, Pencil, Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { Button, Card, Field, IconButton, Input, Select, Textarea, cn, nestedSurfaceClasses } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";
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
}: TasksPageClientProps) {
  const isReadOnly = useEditionReadOnly();
  const [resolveState, resolveFormAction, isResolving] = useActionState(resolveTaskAction, initialActionState);
  const [updateTaskState, updateTaskFormAction, isUpdatingTask] = useActionState(
    updateTodoTaskAction,
    initialActionState
  );
  const [statusState, statusFormAction, isTogglingStatus] = useActionState(
    setTodoTaskStatusAction,
    initialActionState
  );
  const [deleteTaskState, deleteTaskFormAction, isDeletingTask] = useActionState(
    deleteTodoTaskAction,
    initialActionState
  );

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted)]">{copy.common.noEditionSelected}</p>
      </div>
    );
  }

  if (todos.length === 0 && ungroupedTasks.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted)]">{copy.tasks.noPendingTasks}</p>
      </div>
    );
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
        <Card as="div" className="space-y-2">
          <h3 className="text-sm font-semibold">{copy.tasks.standaloneTasks}</h3>
          <FormError message={updateTaskState.error} />
          <FormError message={statusState.error} />
          <FormError message={deleteTaskState.error} />
          <FormError message={resolveState.error} />
          {ungroupedTasks.map((task) => {
            const expenseReport = task.expenseReport;
            const shift = task.staffAssignment?.shift;
            const eventDay = shift?.eventDay;
            const event = eventDay?.event;
            const isGeneral = task.type === "GENERAL";
            const canManageTask = task.createdById === access.id && !isReadOnly;

            return (
              <div key={task.id} className={cn(nestedSurfaceClasses, "p-3")}>
                <TaskTypeLabel type={task.type} copy={copy.tasks} />

                {isGeneral ? (
                  <>
                    {canManageTask ? (
                      <form action={updateTaskFormAction} className="mt-2 grid gap-2 md:grid-cols-2">
                        <input type="hidden" name="todoTaskId" value={task.id} />
                        <Input type="text" name="title" required defaultValue={task.title} />
                        <Input
                          type="datetime-local"
                          name="dueDate"
                          defaultValue={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : ""}
                        />
                        <Textarea
                          name="description"
                          rows={2}
                          defaultValue={task.description ?? ""}
                          className="md:col-span-2"
                        />
                        {access.role === "ADMIN" ? (
                          <div className="md:col-span-2">
                            <Select name="assignedToUserId" defaultValue={task.assignedToUserId ?? ""}>
                              <option value="">{copy.tasks.unassigned}</option>
                              {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.name}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ) : null}
                        <div className="md:col-span-2">
                          <Button type="submit" variant="primary" disabled={isUpdatingTask}>
                            {copy.tasks.saveTask}
                          </Button>
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
                      {isReadOnly ? null : (
                      <form action={statusFormAction}>
                        <input type="hidden" name="todoTaskId" value={task.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={task.status === "DONE" ? "PENDING" : "DONE"}
                        />
                        <Button type="submit" variant="primary" size="sm" disabled={isTogglingStatus}>
                          {task.status === "DONE" ? copy.tasks.markPending : copy.tasks.markDone}
                        </Button>
                      </form>
                      )}
                      {canManageTask ? (
                        <form action={deleteTaskFormAction}>
                          <input type="hidden" name="todoTaskId" value={task.id} />
                          <Button type="submit" variant="destructive" size="sm" disabled={isDeletingTask}>
                            {copy.tasks.deleteTask}
                          </Button>
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

                    {isReadOnly ? null : (
                      <form action={resolveFormAction} className="mt-2">
                        <input type="hidden" name="taskId" value={task.id} />
                        <Button type="submit" variant="primary" size="sm" disabled={isResolving}>
                          {copy.tasks.markDone}
                        </Button>
                      </form>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </Card>
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
  const isReadOnly = useEditionReadOnly();
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [deletingTodoId, setDeletingTodoId] = useState<string | null>(null);
  const canManageTodoTasks = todo.createdById === access.id && !isReadOnly;

  const isEditing = editingTodoId === todo.id;
  const isDeleting = deletingTodoId === todo.id;

  const [updateTodoState, updateTodoFormAction, isSavingTodo] = useActionState(updateTodoAction, initialActionState);
  const [deleteTodoState, deleteTodoFormAction, isDeletingTodo] = useActionState(deleteTodoAction, initialActionState);
  const [createTaskState, createTaskFormAction, isCreatingTask] = useActionState(
    createTodoTaskAction,
    initialActionState
  );
  const [statusState, statusFormAction, isTogglingStatus] = useActionState(
    setTodoTaskStatusAction,
    initialActionState
  );
  const [updateTaskState, updateTaskFormAction, isUpdatingTask] = useActionState(
    updateTodoTaskAction,
    initialActionState
  );
  const [deleteTaskState, deleteTaskFormAction, isDeletingTask] = useActionState(
    deleteTodoTaskAction,
    initialActionState
  );

  return (
    <Card as="article" className="space-y-3">
      {isEditing ? (
        <form action={updateTodoFormAction} className="grid gap-3 md:grid-cols-2">
          <FormError message={updateTodoState.error} className="md:col-span-2" />
          <input type="hidden" name="todoId" value={todo.id} />
          <Field label={copy.tasks.todoTitle} className="md:col-span-2">
            <Input type="text" name="title" required defaultValue={todo.title} />
          </Field>
          <Field label={copy.tasks.todoDescription} className="md:col-span-2">
            <Textarea name="description" rows={2} defaultValue={todo.description ?? ""} />
          </Field>
          {isAdmin ? (
            <Field label={copy.tasks.assignTodoTo} className="md:col-span-2">
              <Select name="assignedToUserId" defaultValue={todo.assignedToUserId ?? ""}>
                <option value="">{copy.tasks.unassigned}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" variant="primary" disabled={isSavingTodo}>
              {copy.tasks.saveTodo}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditingTodoId(null)}>
              {copy.common.cancel ?? "Cancel"}
            </Button>
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
            {isAdmin && todo.createdById === access.id && !isReadOnly ? (
              <>
                <IconButton type="button" tone="accent" label="Edit" onClick={() => setEditingTodoId(todo.id)}>
                  <Pencil />
                </IconButton>
                <IconButton type="button" tone="delete" label="Delete" onClick={() => setDeletingTodoId(todo.id)}>
                  <Trash2 />
                </IconButton>
              </>
            ) : null}
          </div>
        </div>
      )}

      {isDeleting ? (
        <form
          action={deleteTodoFormAction}
          className="grid gap-2 rounded-xl border border-dashed border-rose-400/50 bg-rose-950/20 p-3 md:grid-cols-[1fr_auto]"
        >
          <FormError message={deleteTodoState.error} className="md:col-span-2" />
          <input type="hidden" name="todoId" value={todo.id} />
          <Field label={copy.tasks.typeDeleteToConfirm} className="text-rose-300">
            <Input type="text" name="confirmDelete" tone="danger" required placeholder="delete" autoFocus />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="destructive" disabled={isDeletingTodo}>
              {copy.tasks.delete}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDeletingTodoId(null)}>
              {copy.common.cancel ?? "Cancel"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className={cn(nestedSurfaceClasses, "space-y-2 p-3")}>
        <p className="text-sm font-semibold">{copy.tasks.todoTasks}</p>

        {canManageTodoTasks ? (
          <form action={createTaskFormAction} className="grid gap-2 md:grid-cols-2">
            <FormError message={createTaskState.error} className="md:col-span-2" />
            <input type="hidden" name="todoId" value={todo.id} />
            <Input type="text" name="title" required placeholder={copy.tasks.taskTitle} />
            <Input type="datetime-local" name="dueDate" />
            <Textarea
              name="description"
              rows={2}
              placeholder={copy.tasks.taskDescription}
              className="md:col-span-2"
            />
            {isAdmin ? (
              <div className="md:col-span-2">
                <Select name="assignedToUserId" defaultValue="">
                  <option value="">{copy.tasks.unassigned}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="md:col-span-2">
              <Button type="submit" variant="primary" disabled={isCreatingTask}>
                {copy.tasks.createTask}
              </Button>
            </div>
          </form>
        ) : null}

        <FormError message={statusState.error} />
        <FormError message={updateTaskState.error} />
        <FormError message={deleteTaskState.error} />

        {todo.tasks.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">{copy.tasks.noTasks}</p>
        ) : (
          <ul className="space-y-2">
            {todo.tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3"
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
                  {isReadOnly ? null : (
                  <form action={statusFormAction} className="inline">
                    <input type="hidden" name="todoTaskId" value={task.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={task.status === "DONE" ? "PENDING" : "DONE"}
                    />
                    <IconButton
                      type="submit"
                      tone="neutral"
                      label={task.status === "DONE" ? "Mark pending" : "Mark done"}
                      disabled={isTogglingStatus}
                    >
                      {task.status === "DONE" ? <Check /> : <Circle />}
                    </IconButton>
                  </form>
                  )}
                  {canManageTodoTasks ? (
                    <>
                      <form action={updateTaskFormAction} className="inline">
                        <input type="hidden" name="todoTaskId" value={task.id} />
                        <IconButton type="submit" tone="accent" label="Edit" disabled={isUpdatingTask}>
                          <Pencil />
                        </IconButton>
                      </form>
                      <form action={deleteTaskFormAction} className="inline">
                        <input type="hidden" name="todoTaskId" value={task.id} />
                        <IconButton type="submit" tone="delete" label="Delete" disabled={isDeletingTask}>
                          <Trash2 />
                        </IconButton>
                      </form>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
