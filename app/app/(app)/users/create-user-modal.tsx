"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { UserRole } from "@prisma/client";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal, MultiSelect, Select } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import { createUserAction } from "./actions";

type DepartmentItem = {
  id: string;
  name: string;
};

type Copy = {
  create: string;
  cancel: string;
  createButton: string;
  passwordRules: string;
  name: string;
  email: string;
  password: string;
  role: string;
  admin: string;
  department: string;
  departments: string;
};

type Props = {
  departments: DepartmentItem[];
  copy: Copy;
};

export function CreateUserModal({ departments, copy }: Props) {
  const [open, setOpen] = useState(false);
  const [createState, createFormAction, isCreating] = useActionState(createUserAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(createState, isCreating, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <Plus />
        {copy.create}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.create}
        size="md"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" form="create-user-form" variant="primary" disabled={isCreating}>
              {copy.createButton}
            </Button>
          </>
        }
      >
        <form id="create-user-form" action={createFormAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={createState.error} />
          <p className="text-sm text-[var(--muted)]">{copy.passwordRules}</p>

          <Field label={copy.name}>
            <Input type="text" name="name" required />
          </Field>

          <Field label={copy.email}>
            <Input type="email" name="email" required />
          </Field>

          <Field label={copy.password}>
            <Input type="password" name="password" required />
          </Field>

          <Field label={copy.role}>
            <Select name="role" defaultValue={UserRole.ADMIN}>
              <option value={UserRole.ADMIN}>{copy.admin}</option>
              <option value={UserRole.DEPARTMENT}>{copy.department}</option>
            </Select>
          </Field>

          <Field label={copy.departments}>
            <MultiSelect name="departmentIds" defaultValue={[]} rows={departments.length}>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </MultiSelect>
          </Field>
        </form>
      </Modal>
    </>
  );
}
