"use client";

import { useActionState } from "react";

import { FormError } from "@/components/form-error";
import { Button, Card, Checkbox, Field, Input, Textarea, nestedSurfaceClasses } from "@/components/ui";
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
    <Card as="section">
      <h2 className="text-lg font-semibold">{copy.createAppointment}</h2>
      <form action={formAction} className="mt-4 grid gap-3 md:grid-cols-2">
        <FormError message={state.error} className="md:col-span-2" />
        <div className="md:col-span-2">
          <Field label={copy.appointmentTitle}>
            <Input type="text" name="title" required />
          </Field>
        </div>

        <div className="md:col-span-2">
          <Field label={copy.appointmentDescription}>
            <Textarea name="description" rows={3} required />
          </Field>
        </div>

        <Field label={copy.startsAt}>
          <Input type="datetime-local" name="startAt" required />
        </Field>

        <Field label={copy.endsAtOptional}>
          <Input type="datetime-local" name="endAt" />
        </Field>

        <div className="md:col-span-2 space-y-1">
          <span className="text-sm font-medium">{copy.audience}</span>
          <details className={nestedSurfaceClasses}>
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
          <Button type="submit" variant="primary" disabled={isPending}>
            {copy.submitAppointment}
          </Button>
        </div>
      </form>
    </Card>
  );
}
