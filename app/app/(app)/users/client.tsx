"use client";

import { useActionState, useState } from "react";
import { Pencil, X } from "lucide-react";
import { UserRole } from "@prisma/client";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Badge, type BadgeTone, Button, Card, ConfirmDelete, Field, IconButton, Input, MultiSelect, Select } from "@/components/ui";
import type { getDictionary } from "@/lib/i18n";
import { initialActionState } from "@/lib/server-action-helpers";

import { deleteUserAction, resetUserTwoFactorAction, updateUserAction } from "./actions";
import { ResetTwoFactorButton } from "./reset-two-factor-button";

type DepartmentItem = {
  id: string;
  name: string;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  departments: DepartmentItem[];
};

type Dictionary = ReturnType<typeof getDictionary>;

export function UsersPageClient({
  users,
  departments,
  currentUserId,
  copy,
}: {
  users: UserItem[];
  departments: DepartmentItem[];
  currentUserId: string;
  copy: Dictionary;
}) {
  // The screen opens as a list of accounts, not as a page of live inputs: one
  // card at a time turns into its form, and the pencil is what does it.
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const [updateState, updateFormAction, isUpdating] = useActionState(updateUserAction, initialActionState);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteUserAction, initialActionState);
  const [resetState, resetFormAction, isResetting] = useActionState(resetUserTwoFactorAction, initialActionState);
  const markUpdateSubmitted = useCloseOnSuccess(updateState, isUpdating, () => setEditingUserId(null));

  const roleBadges: Record<UserRole, { tone: BadgeTone; label: string }> = {
    [UserRole.ADMIN]: { tone: "info", label: copy.users.admin },
    [UserRole.DEPARTMENT]: { tone: "neutral", label: copy.users.department },
    [UserRole.GUEST]: { tone: "warning", label: copy.users.guest },
  };

  return (
    <section className="space-y-3">
      <FormError message={updateState.error} />
      <FormError message={deleteState.error} />
      <FormError message={resetState.error} />
      {users.map((user) => {
        const isSelf = user.id === currentUserId;
        const isEditing = editingUserId === user.id;

        return (
          <Card key={user.id} as="article">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {user.twoFactorEnabled ? <Badge tone="success">{copy.users.twoFactorOn}</Badge> : null}
                <Badge tone={roleBadges[user.role].tone}>{roleBadges[user.role].label}</Badge>
                {isEditing ? (
                  <IconButton tone="neutral" label={copy.shell.cancel} onClick={() => setEditingUserId(null)}>
                    <X />
                  </IconButton>
                ) : (
                  <IconButton tone="accent" label={copy.users.editUser} onClick={() => setEditingUserId(user.id)}>
                    <Pencil />
                  </IconButton>
                )}
              </div>
            </div>

            {isEditing ? (
              <>
                <form
                  id={`update-user-${user.id}`}
                  action={updateFormAction}
                  onSubmit={markUpdateSubmitted}
                  className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_170px_200px]"
                >
                  <input type="hidden" name="userId" value={user.id} />
                  <Field required label={copy.users.name}>
                    <Input type="text" name="name" defaultValue={user.name} required />
                  </Field>
                  <Field required label={copy.users.email}>
                    <Input type="email" name="email" defaultValue={user.email} required />
                  </Field>
                  <Field label={copy.users.role}>
                    <Select name="role" defaultValue={user.role}>
                      {user.role === UserRole.GUEST ? (
                        <option value={UserRole.GUEST}>{copy.users.guest}</option>
                      ) : (
                        <option value={UserRole.ADMIN}>{copy.users.admin}</option>
                      )}
                      <option value={UserRole.DEPARTMENT}>{copy.users.department}</option>
                    </Select>
                  </Field>
                  <Field label={copy.users.departments}>
                    <MultiSelect
                      name="departmentIds"
                      defaultValue={user.departments.map((department) => department.id)}
                      rows={departments.length}
                    >
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </MultiSelect>
                  </Field>
                  <Field label={copy.users.newPasswordOptional} className="sm:col-span-2 xl:col-span-4">
                    <Input type="password" name="newPassword" />
                  </Field>
                </form>

                {/* Deleting lives inside the form's own row: reading an account is
                    safe, and the one screen state that can change it is the one
                    that can also end it. A form inside a form is not a thing, so
                    it reaches its own by id. */}
                <form id={`delete-user-${user.id}`} action={deleteFormAction}>
                  <input type="hidden" name="userId" value={user.id} />
                </form>
                <form id={`reset-2fa-${user.id}`} action={resetFormAction}>
                  <input type="hidden" name="userId" value={user.id} />
                </form>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    form={`update-user-${user.id}`}
                    variant="primary"
                    disabled={isUpdating}
                  >
                    {copy.users.updateButton}
                  </Button>
                  {/* Your own second factor is turned off on /account, where it
                      costs your password — so the button is not offered here. */}
                  {user.twoFactorEnabled && !isSelf ? (
                    <ResetTwoFactorButton
                      form={`reset-2fa-${user.id}`}
                      label={copy.users.resetTwoFactor}
                      subject={user.name}
                      message={copy.users.resetTwoFactorMessage}
                      cancelLabel={copy.shell.cancel}
                      disabled={isResetting}
                    />
                  ) : null}
                  <ConfirmDelete
                    form={`delete-user-${user.id}`}
                    trigger="button"
                    label={copy.users.deleteButton}
                    subject={user.name}
                    message={copy.common.cannotBeUndone}
                    cancelLabel={copy.shell.cancel}
                    disabled={isSelf || isDeleting}
                    className="ml-auto"
                  />
                </div>
                {isSelf ? <p className="mt-2 text-xs text-[var(--muted)]">{copy.users.cannotDeleteSelf}</p> : null}
              </>
            ) : user.role === UserRole.GUEST ? null : (
              /* Departments read as what they are — a list this account belongs
                 to — rather than as a multi-select nobody is about to touch. */
              <div className="mt-3 flex flex-wrap gap-1.5">
                {user.departments.length === 0 ? (
                  <span className="text-xs text-[var(--muted)]">{copy.users.noDepartments}</span>
                ) : (
                  user.departments.map((department) => (
                    <Badge key={department.id}>{department.name}</Badge>
                  ))
                )}
              </div>
            )}
          </Card>
        );
      })}
    </section>
  );
}
