"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { UserRole } from "@prisma/client";

import { FormError } from "@/components/form-error";
import { Button, Card, Field, IconButton, Input, MultiSelect, SectionTitle, Select } from "@/components/ui";
import type { getDictionary } from "@/lib/i18n";
import { initialActionState } from "@/lib/server-action-helpers";

import { createUserAction, deleteUserAction, updateUserAction } from "./actions";

type DepartmentRoleItem = {
  id: string;
  name: string;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  departmentRoles: DepartmentRoleItem[];
};

type Dictionary = ReturnType<typeof getDictionary>;

export function UsersPageClient({
  users,
  departmentRoles,
  currentUserId,
  copy,
}: {
  users: UserItem[];
  departmentRoles: DepartmentRoleItem[];
  currentUserId: string;
  copy: Dictionary;
}) {
  const [updateState, updateFormAction, isUpdating] = useActionState(updateUserAction, initialActionState);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteUserAction, initialActionState);
  const [createState, createFormAction, isCreating] = useActionState(createUserAction, initialActionState);

  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <FormError message={updateState.error} />
        <FormError message={deleteState.error} />
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          return (
            <Card key={user.id} as="article">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <form action={updateFormAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_170px_200px]">
                    <input type="hidden" name="userId" value={user.id} />
                    <Field label={copy.users.name}>
                      <Input type="text" name="name" defaultValue={user.name} required size="sm" />
                    </Field>
                    <Field label={copy.users.email}>
                      <Input type="email" name="email" defaultValue={user.email} required size="sm" />
                    </Field>
                    <Field label={copy.users.role}>
                      <Select name="role" defaultValue={user.role} size="sm">
                        <option value={UserRole.ADMIN}>{copy.users.admin}</option>
                        <option value={UserRole.DEPARTMENT}>{copy.users.department}</option>
                      </Select>
                    </Field>
                    <Field label={copy.users.departments}>
                      <MultiSelect
                        name="departmentRoleIds"
                        defaultValue={user.departmentRoles.map((departmentRole) => departmentRole.id)}
                        rows={departmentRoles.length}
                      >
                        {departmentRoles.map((departmentRole) => (
                          <option key={departmentRole.id} value={departmentRole.id}>
                            {departmentRole.name}
                          </option>
                        ))}
                      </MultiSelect>
                    </Field>
                    <Field label={copy.users.newPasswordOptional} className="md:col-span-2 xl:col-span-3">
                      <Input type="password" name="newPassword" size="sm" />
                    </Field>
                    <div className="flex items-end justify-end gap-2 md:col-span-2 xl:col-span-1">
                      <Button type="submit" variant="secondary" size="sm" disabled={isUpdating}>
                        {copy.users.updateButton}
                      </Button>
                    </div>
                  </form>
                  {isSelf ? (
                    <p className="mt-3 text-xs text-[var(--muted)]">{copy.users.cannotDeleteSelf}</p>
                  ) : null}
                </div>

                <form action={deleteFormAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <IconButton
                    type="submit"
                    tone="delete"
                    label={isSelf ? copy.users.cannotDeleteSelf : copy.users.deleteButton}
                    disabled={isSelf || isDeleting}
                  >
                    <Trash2 />
                  </IconButton>
                </form>
              </div>
            </Card>
          );
        })}
      </div>

      <div>
        <Card as="section">
          <SectionTitle>{copy.users.create}</SectionTitle>
          <p className="mt-2 text-sm text-[var(--muted)]">{copy.users.passwordRules}</p>
          <form action={createFormAction} className="mt-6 space-y-4">
            <FormError message={createState.error} />
            <Field label={copy.users.name}>
              <Input type="text" name="name" required />
            </Field>

            <Field label={copy.users.email}>
              <Input type="email" name="email" required />
            </Field>

            <Field label={copy.users.password}>
              <Input type="password" name="password" required />
            </Field>

            <Field label={copy.users.role}>
              <Select name="role" defaultValue={UserRole.ADMIN}>
                <option value={UserRole.ADMIN}>{copy.users.admin}</option>
                <option value={UserRole.DEPARTMENT}>{copy.users.department}</option>
              </Select>
            </Field>

            <Field label={copy.users.departments}>
              <MultiSelect name="departmentRoleIds" defaultValue={[]} rows={departmentRoles.length}>
                {departmentRoles.map((departmentRole) => (
                  <option key={departmentRole.id} value={departmentRole.id}>
                    {departmentRole.name}
                  </option>
                ))}
              </MultiSelect>
            </Field>

            <Button type="submit" variant="primary" disabled={isCreating}>
              {copy.users.createButton}
            </Button>
          </form>
        </Card>
      </div>
    </section>
  );
}
