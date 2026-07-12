"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";

import { FormError } from "@/components/form-error";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

type UserItem = {
  id: string;
  name: string;
};

type TasksCopy = {
  openCreateModal: string;
  closeCreateModal: string;
  createTodo: string;
  createTask: string;
  todoTitle: string;
  todoDescription: string;
  assignTodoTo: string;
  unassigned: string;
  createStandaloneTask: string;
  todoTaskTitle: string;
  todoTaskDescription: string;
  dueDateOptional: string;
  assignTaskTo: string;
};

type Props = {
  copy: TasksCopy;
  users: UserItem[];
  isAdmin: boolean;
  createTodoAction: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  createTodoTaskAction: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
};

export function TasksCreateModal({ copy, users, isAdmin, createTodoAction, createTodoTaskAction }: Props) {
  const [open, setOpen] = useState(false);
  const [createTodoState, createTodoFormAction, isCreatingTodo] = useActionState(createTodoAction, initialActionState);
  const [createTaskState, createTaskFormAction, isCreatingTask] = useActionState(
    createTodoTaskAction,
    initialActionState
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
      >
        <Plus className="h-4 w-4" />
        {copy.openCreateModal}
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{copy.openCreateModal}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-[var(--line)] p-1.5 text-[var(--muted)] hover:bg-[var(--panel)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <form action={createTodoFormAction} className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <h4 className="font-semibold">{copy.createTodo}</h4>
                <FormError message={createTodoState.error} />
                <label className="block space-y-1">
                  <span className="text-sm">{copy.todoTitle}</span>
                  <input
                    type="text"
                    name="title"
                    required
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm">{copy.todoDescription}</span>
                  <textarea
                    name="description"
                    rows={2}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                {isAdmin ? (
                  <label className="block space-y-1">
                    <span className="text-sm">{copy.assignTodoTo}</span>
                    <select
                      name="assignedToUserId"
                      defaultValue=""
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">{copy.unassigned}</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  disabled={isCreatingTodo}
                  className="rounded-md border border-[var(--line)] px-4 py-2 text-xs font-semibold hover:bg-[var(--panel-strong)] disabled:opacity-60"
                >
                  {copy.createTodo}
                </button>
              </form>

              <form action={createTaskFormAction} className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <h4 className="font-semibold">{copy.createStandaloneTask}</h4>
                <FormError message={createTaskState.error} />
                <label className="block space-y-1">
                  <span className="text-sm">{copy.todoTaskTitle}</span>
                  <input
                    type="text"
                    name="title"
                    required
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm">{copy.todoTaskDescription}</span>
                  <textarea
                    name="description"
                    rows={2}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm">{copy.dueDateOptional}</span>
                  <input
                    type="datetime-local"
                    name="dueDate"
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                {isAdmin ? (
                  <label className="block space-y-1">
                    <span className="text-sm">{copy.assignTaskTo}</span>
                    <select
                      name="assignedToUserId"
                      defaultValue=""
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">{copy.unassigned}</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  disabled={isCreatingTask}
                  className="rounded-md border border-[var(--line)] px-4 py-2 text-xs font-semibold hover:bg-[var(--panel-strong)] disabled:opacity-60"
                >
                  {copy.createTask}
                </button>
              </form>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-[var(--line)] px-4 py-2 text-xs font-semibold hover:bg-[var(--panel)]"
              >
                {copy.closeCreateModal}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
