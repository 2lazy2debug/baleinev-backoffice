"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, IconButton, Input, Modal, Select, Textarea } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import { createTodoTaskAction, updateTodoTaskAction } from "./actions";

type UserSummary = { id: string; name: string };

type TaskModalCopy = {
  todoTaskTitle: string;
  todoTaskDescription: string;
  dueDateOptional: string;
  assignTaskTo: string;
  unassigned: string;
  createTask: string;
  saveTask: string;
  editTask: string;
};

type Props = {
  copy: TaskModalCopy;
  cancelLabel: string;
  users: UserSummary[];
  isAdmin: boolean;
};

function AssigneeSelect({
  copy,
  users,
  defaultValue,
}: {
  copy: TaskModalCopy;
  users: UserSummary[];
  defaultValue: string;
}) {
  return (
    <Field label={copy.assignTaskTo}>
      <Select name="assignedToUserId" defaultValue={defaultValue}>
        <option value="">{copy.unassigned}</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CreateTodoTaskModal({ todoId, copy, cancelLabel, users, isAdmin }: Props & { todoId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createTodoTaskAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, () => setOpen(false));
  const formId = `create-todo-task-${todoId}`;

  return (
    <>
      <Button type="button" variant="primary" size="sm" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.createTask}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.createTask}
        size="md"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {cancelLabel}
            </Button>
            <Button type="submit" form={formId} variant="primary" disabled={pending}>
              {copy.createTask}
            </Button>
          </>
        }
      >
        <form id={formId} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />
          <input type="hidden" name="todoId" value={todoId} />
          <Field label={copy.todoTaskTitle}>
            <Input type="text" name="title" required />
          </Field>
          <Field label={copy.todoTaskDescription}>
            <Textarea name="description" rows={2} />
          </Field>
          <Field label={copy.dueDateOptional}>
            <Input type="datetime-local" name="dueDate" />
          </Field>
          {isAdmin ? <AssigneeSelect copy={copy} users={users} defaultValue="" /> : null}
        </form>
      </Modal>
    </>
  );
}

type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | string | null;
  assignedToUserId?: string | null;
  assignedToUser: UserSummary | null;
};

export function EditTaskModal({ task, copy, cancelLabel, users, isAdmin }: Props & { task: EditableTask }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateTodoTaskAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, () => setOpen(false));
  const formId = `edit-task-${task.id}`;
  const assigneeId = task.assignedToUserId ?? task.assignedToUser?.id ?? "";

  return (
    <>
      <IconButton type="button" tone="accent" label={copy.editTask} onClick={() => setOpen(true)}>
        <Pencil />
      </IconButton>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.editTask}
        size="md"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {cancelLabel}
            </Button>
            <Button type="submit" form={formId} variant="primary" disabled={pending}>
              {copy.saveTask}
            </Button>
          </>
        }
      >
        <form id={formId} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />
          <input type="hidden" name="todoTaskId" value={task.id} />
          <Field label={copy.todoTaskTitle}>
            <Input type="text" name="title" required defaultValue={task.title} />
          </Field>
          <Field label={copy.todoTaskDescription}>
            <Textarea name="description" rows={2} defaultValue={task.description ?? ""} />
          </Field>
          <Field label={copy.dueDateOptional}>
            <Input
              type="datetime-local"
              name="dueDate"
              defaultValue={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : ""}
            />
          </Field>
          {isAdmin ? <AssigneeSelect copy={copy} users={users} defaultValue={assigneeId} /> : null}
        </form>
      </Modal>
    </>
  );
}
