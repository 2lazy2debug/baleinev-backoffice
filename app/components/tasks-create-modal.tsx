"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { Button, Field, Input, Modal, Select, Textarea, cn, nestedSurfaceClasses } from "@/components/ui";
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
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {copy.openCreateModal}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.openCreateModal}
        size="xl"
        footer={
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {copy.closeCreateModal}
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <form
            action={createTodoFormAction}
            className={cn(nestedSurfaceClasses, "space-y-3 p-4")}
          >
            <h4 className="font-semibold">{copy.createTodo}</h4>
            <FormError message={createTodoState.error} />
            <Field label={copy.todoTitle}>
              <Input type="text" name="title" required />
            </Field>
            <Field label={copy.todoDescription}>
              <Textarea name="description" rows={2} />
            </Field>
            {isAdmin ? (
              <Field label={copy.assignTodoTo}>
                <Select name="assignedToUserId" defaultValue="">
                  <option value="">{copy.unassigned}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Button type="submit" variant="secondary" disabled={isCreatingTodo}>
              {copy.createTodo}
            </Button>
          </form>

          <form
            action={createTaskFormAction}
            className={cn(nestedSurfaceClasses, "space-y-3 p-4")}
          >
            <h4 className="font-semibold">{copy.createStandaloneTask}</h4>
            <FormError message={createTaskState.error} />
            <Field label={copy.todoTaskTitle}>
              <Input type="text" name="title" required />
            </Field>
            <Field label={copy.todoTaskDescription}>
              <Textarea name="description" rows={2} />
            </Field>
            <Field label={copy.dueDateOptional}>
              <Input type="datetime-local" name="dueDate" />
            </Field>
            {isAdmin ? (
              <Field label={copy.assignTaskTo}>
                <Select name="assignedToUserId" defaultValue="">
                  <option value="">{copy.unassigned}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Button type="submit" variant="secondary" disabled={isCreatingTask}>
              {copy.createTask}
            </Button>
          </form>
        </div>
      </Modal>
    </>
  );
}
