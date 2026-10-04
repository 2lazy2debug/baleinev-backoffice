"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
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

type Kind = "todo" | "task";

export function TasksCreateModal({ copy, users, isAdmin, createTodoAction, createTodoTaskAction }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("todo");
  const [todoState, todoFormAction, isCreatingTodo] = useActionState(createTodoAction, initialActionState);
  const [taskState, taskFormAction, isCreatingTask] = useActionState(createTodoTaskAction, initialActionState);

  const isTodo = kind === "todo";
  const state = isTodo ? todoState : taskState;
  const pending = isTodo ? isCreatingTodo : isCreatingTask;
  const markSubmitted = useCloseOnSuccess(state, pending, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.openCreateModal}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.openCreateModal}
        size="md"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.closeCreateModal}
            </Button>
            <Button type="submit" form="tasks-create-form" variant="primary" disabled={pending}>
              {isTodo ? copy.createTodo : copy.createTask}
            </Button>
          </>
        }
      >
        <form
          id="tasks-create-form"
          key={kind}
          action={isTodo ? todoFormAction : taskFormAction}
          onSubmit={markSubmitted}
          className="space-y-4"
        >
          <FormError message={state.error} />
          <Field label={copy.openCreateModal}>
            <Select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
              <option value="todo">{copy.createTodo}</option>
              <option value="task">{copy.createStandaloneTask}</option>
            </Select>
          </Field>
          <Field label={isTodo ? copy.todoTitle : copy.todoTaskTitle}>
            <Input type="text" name="title" required />
          </Field>
          <Field label={isTodo ? copy.todoDescription : copy.todoTaskDescription}>
            <Textarea name="description" rows={2} />
          </Field>
          {isTodo ? null : (
            <Field label={copy.dueDateOptional}>
              <Input type="datetime-local" name="dueDate" />
            </Field>
          )}
          {isAdmin ? (
            <Field label={isTodo ? copy.assignTodoTo : copy.assignTaskTo}>
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
        </form>
      </Modal>
    </>
  );
}
