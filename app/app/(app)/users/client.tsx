"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { UserRole } from "@prisma/client";

import { FormError } from "@/components/form-error";
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
      <div className="grid gap-4">
        <FormError message={updateState.error} />
        <FormError message={deleteState.error} />
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          return (
            <article key={user.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <form action={updateFormAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_170px_200px]">
                    <input type="hidden" name="userId" value={user.id} />
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--muted)]">{copy.users.name}</span>
                      <input
                        type="text"
                        name="name"
                        defaultValue={user.name}
                        required
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--muted)]">{copy.users.email}</span>
                      <input
                        type="email"
                        name="email"
                        defaultValue={user.email}
                        required
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--muted)]">{copy.users.role}</span>
                      <select
                        name="role"
                        defaultValue={user.role}
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                      >
                        <option value={UserRole.ADMIN}>{copy.users.admin}</option>
                        <option value={UserRole.DEPARTMENT}>{copy.users.department}</option>
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--muted)]">{copy.users.departments}</span>
                      <select
                        name="departmentRoleIds"
                        defaultValue={user.departmentRoles.map((departmentRole) => departmentRole.id)}
                        multiple
                        size={Math.min(Math.max(departmentRoles.length, 3), 8)}
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                      >
                        {departmentRoles.map((departmentRole) => (
                          <option key={departmentRole.id} value={departmentRole.id}>
                            {departmentRole.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1 md:col-span-2 xl:col-span-3">
                      <span className="text-xs font-medium text-[var(--muted)]">{copy.users.newPasswordOptional}</span>
                      <input
                        type="password"
                        name="newPassword"
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                      />
                    </label>
                    <div className="flex items-end justify-end gap-2 md:col-span-2 xl:col-span-1">
                      <button
                        disabled={isUpdating}
                        className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[var(--panel)] disabled:opacity-60"
                      >
                        {copy.users.updateButton}
                      </button>
                    </div>
                  </form>
                  {isSelf ? (
                    <p className="mt-3 text-xs text-[var(--muted)]">{copy.users.cannotDeleteSelf}</p>
                  ) : null}
                </div>

                <form action={deleteFormAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button
                    disabled={isSelf || isDeleting}
                    title={isSelf ? copy.users.cannotDeleteSelf : copy.users.deleteButton}
                    className="rounded-md border border-rose-300 p-2 text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)] disabled:hover:bg-transparent"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
        <h2 className="text-xl font-semibold">{copy.users.create}</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{copy.users.passwordRules}</p>
        <form action={createFormAction} className="mt-6 space-y-4">
          <FormError message={createState.error} />
          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.users.name}</span>
            <input
              type="text"
              name="name"
              required
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.users.email}</span>
            <input
              type="email"
              name="email"
              required
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.users.password}</span>
            <input
              type="password"
              name="password"
              required
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.users.role}</span>
            <select
              name="role"
              defaultValue={UserRole.ADMIN}
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            >
              <option value={UserRole.ADMIN}>{copy.users.admin}</option>
              <option value={UserRole.DEPARTMENT}>{copy.users.department}</option>
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.users.departments}</span>
            <select
              name="departmentRoleIds"
              defaultValue={[]}
              multiple
              size={Math.min(Math.max(departmentRoles.length, 3), 8)}
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            >
              {departmentRoles.map((departmentRole) => (
                <option key={departmentRole.id} value={departmentRole.id}>
                  {departmentRole.name}
                </option>
              ))}
            </select>
          </label>

          <button
            disabled={isCreating}
            className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {copy.users.createButton}
          </button>
        </form>
      </section>
    </section>
  );
}
