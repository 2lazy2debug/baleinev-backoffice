"use client";

import { useActionState } from "react";

import { FormError } from "@/components/form-error";
import { Checkbox } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import { createAppointmentAction } from "./actions";

type Copy = {
  createAppointment: string;
  appointmentTitle: string;
  appointmentDescription: string;
  startsAt: string;
  endsAtOptional: string;
  audience: string;
  audienceHelp: string;
  person: string;
  department: string;
  noAudienceMeansPrivate: string;
  submitAppointment: string;
};

export function CreateAppointmentForm({
  copy,
  users,
  departments,
}: {
  copy: Copy;
  users: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, isPending] = useActionState(createAppointmentAction, initialActionState);

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5">
      <h2 className="text-lg font-semibold">{copy.createAppointment}</h2>
      <form action={formAction} className="mt-4 grid gap-3 md:grid-cols-2">
        <FormError message={state.error} className="md:col-span-2" />
        <label className="block space-y-1 md:col-span-2">
          <span className="text-sm font-medium">{copy.appointmentTitle}</span>
          <input
            type="text"
            name="title"
            required
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="block space-y-1 md:col-span-2">
          <span className="text-sm font-medium">{copy.appointmentDescription}</span>
          <textarea
            name="description"
            rows={3}
            required
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{copy.startsAt}</span>
          <input
            type="datetime-local"
            name="startAt"
            required
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{copy.endsAtOptional}</span>
          <input
            type="datetime-local"
            name="endAt"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <div className="md:col-span-2 space-y-1">
          <span className="text-sm font-medium">{copy.audience}</span>
          <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <summary className="cursor-pointer px-3 py-2 text-sm text-[var(--muted)]">{copy.audienceHelp}</summary>
            <div className="max-h-56 space-y-2 overflow-y-auto border-t border-[var(--line)] px-3 py-2 text-sm">
              <Checkbox id="audience-everyone" name="audience" value="@everyone" label="@everyone" />
              <p className="pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{copy.person}</p>
              {users.map((user) => (
                <Checkbox
                  key={user.id}
                  id={`audience-user-${user.id}`}
                  name="audience"
                  value={`user:${user.id}`}
                  label={user.name}
                />
              ))}
              <p className="pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{copy.department}</p>
              {departments.map((department) => (
                <Checkbox
                  key={department.id}
                  id={`audience-department-${department.id}`}
                  name="audience"
                  value={`department:${department.id}`}
                  label={`@${department.name.toLowerCase()}`}
                />
              ))}
            </div>
          </details>
          <p className="text-xs text-[var(--muted)]">{copy.noAudienceMeansPrivate}</p>
        </div>

        <div className="md:col-span-2">
          <button
            disabled={isPending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {copy.submitAppointment}
          </button>
        </div>
      </form>
    </section>
  );
}
