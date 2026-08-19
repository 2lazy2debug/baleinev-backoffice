"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { Badge, Button, Chip, ChipRemoveButton, IconButton, Input, Panel, PanelHeader, SectionTitle, Select, cn, nestedSurfaceClasses } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import {
  adminAssignUserToShiftAction,
  createEventTypeAction,
  deleteEventAction,
  deleteEventTypeAction,
  deleteShiftAction,
  signUpForShiftAction,
  toggleEventDayOffAction,
  withdrawFromShiftAction,
} from "./actions";
import AddShiftForm from "./add-shift-form";
import CreateEventForm from "./create-event-form";

function formatTime(t: string) {
  return t.slice(0, 5);
}

function formatDate(d: Date | string) {
  return new Date(d).toISOString().slice(0, 10);
}

type EventTypeItem = {
  id: string;
  name: string;
};

type CostCenterItem = {
  id: string;
  code: string;
  name: string;
};

type UserItem = {
  id: string;
  name: string;
};

type AssignmentItem = {
  id: string;
  userId: string;
  user: { id: string; name: string };
};

type ShiftItem = {
  id: string;
  startTime: string;
  endTime: string;
  role: string | null;
  capacity: number;
  assignments: AssignmentItem[];
};

type EventDayItem = {
  id: string;
  date: Date | string;
  isOff: boolean;
  shifts: ShiftItem[];
};

type EventItem = {
  id: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  notes: string | null;
  eventType: { name: string; color: string | null };
  costCenter: { code: string } | null;
  days: EventDayItem[];
};

type EventsCopy = {
  eventTypes: string;
  deleteEventType: string;
  createEventType: string;
  eventTypeName: string;
  eventTypeDescription: string;
  createEvent: string;
  noEventTypes: string;
  eventName: string;
  eventType: string;
  costCenter: string;
  startDate: string;
  endDate: string;
  notes: string;
  noEvents: string;
  deleteEvent: string;
  deleteShift: string;
  isOff: string;
  toggleOn: string;
  toggleOff: string;
  noShifts: string;
  full: string;
  spotsLeft: string;
  withdraw: string;
  signUp: string;
  assignStaff: string;
  role: string;
  addShift: string;
  shiftOverlapWarning: string;
  dateOrderError: string;
  dateOutOfEditionRange: string;
  exportPdf: string;
  downloadingPdf: string;
};

type Props = {
  isAdmin: boolean;
  accessId: string;
  eventTypes: EventTypeItem[];
  costCenters: CostCenterItem[];
  events: EventItem[];
  allUsers: UserItem[];
  editionStartDate: string | null;
  editionEndDate: string | null;
  copy: EventsCopy;
};

export default function EventsPageClient({
  isAdmin,
  accessId,
  eventTypes,
  costCenters,
  events,
  allUsers,
  editionStartDate,
  editionEndDate,
  copy,
}: Props) {
  const [deleteEventTypeState, deleteEventTypeFormAction, isDeletingEventType] = useActionState(
    deleteEventTypeAction,
    initialActionState
  );
  const [createEventTypeState, createEventTypeFormAction, isCreatingEventType] = useActionState(
    createEventTypeAction,
    initialActionState
  );
  const [deleteEventState, deleteEventFormAction, isDeletingEvent] = useActionState(
    deleteEventAction,
    initialActionState
  );
  const [toggleDayOffState, toggleDayOffFormAction, isTogglingDayOff] = useActionState(
    toggleEventDayOffAction,
    initialActionState
  );
  const [signUpState, signUpFormAction, isSigningUp] = useActionState(signUpForShiftAction, initialActionState);
  const [withdrawState, withdrawFormAction, isWithdrawing] = useActionState(
    withdrawFromShiftAction,
    initialActionState
  );
  const isReadOnly = useEditionReadOnly();
  const canManageEvents = isAdmin && !isReadOnly;
  const [adminAssignState, adminAssignFormAction, isAdminAssigning] = useActionState(
    adminAssignUserToShiftAction,
    initialActionState
  );
  const [deleteShiftState, deleteShiftFormAction, isDeletingShift] = useActionState(
    deleteShiftAction,
    initialActionState
  );

  const [pdfError, setPdfError] = useState<string | null>(null);
  const [downloadingEventId, setDownloadingEventId] = useState<string | null>(null);

  async function handleDownloadPdf(event: EventItem) {
    setDownloadingEventId(event.id);
    setPdfError(null);

    try {
      const response = await fetch(`/api/events/${event.id}/pdf`);

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Could not generate PDF.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${event.name || "event"}-schedule.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Could not generate PDF.");
    } finally {
      setDownloadingEventId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Event types are global, so they stay editable in a closed edition.
          Everything below them belongs to the edition and does not. */}
      {/* ── Admin: Event types ────────────────────────────────────────────── */}
      {isAdmin ? (
        <section className="space-y-4">
          <SectionTitle>{copy.eventTypes}</SectionTitle>
          <FormError message={deleteEventTypeState.error} />
          <div className="flex flex-wrap gap-2">
            {eventTypes.map((et) => (
              <form key={et.id} action={deleteEventTypeFormAction} className="inline-flex">
                <input type="hidden" name="id" value={et.id} />
                <Chip
                  action={<ChipRemoveButton label={copy.deleteEventType} disabled={isDeletingEventType} />}
                >
                  {et.name}
                </Chip>
              </form>
            ))}
          </div>
          <FormError message={createEventTypeState.error} />
          <form action={createEventTypeFormAction} className="flex flex-wrap items-end gap-2">
            <div className="w-full sm:w-48">
              <Input type="text" name="name" required placeholder={copy.eventTypeName} />
            </div>
            <div className="w-full sm:w-56">
              <Input type="text" name="description" placeholder={copy.eventTypeDescription} />
            </div>
            <Button type="submit" variant="primary" disabled={isCreatingEventType} className="w-full sm:w-auto">
              {copy.createEventType}
            </Button>
          </form>
        </section>
      ) : null}

      {/* ── Admin: Create event ───────────────────────────────────────────── */}
      {canManageEvents ? (
        <CreateEventForm
          eventTypes={eventTypes}
          costCenters={costCenters}
          editionStartDate={editionStartDate}
          editionEndDate={editionEndDate}
          copy={{
            createEvent: copy.createEvent,
            noEventTypes: copy.noEventTypes,
            eventName: copy.eventName,
            eventType: copy.eventType,
            costCenter: copy.costCenter,
            startDate: copy.startDate,
            endDate: copy.endDate,
            notes: copy.notes,
            dateOrderError: copy.dateOrderError,
            dateOutOfEditionRange: copy.dateOutOfEditionRange,
          }}
        />
      ) : null}

      {/* ── Events list ──────────────────────────────────────────────────── */}
      {events.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{copy.noEvents}</p>
      ) : (
        <div className="space-y-8">
          <FormError message={deleteEventState.error} />
          <FormError message={toggleDayOffState.error} />
          <FormError message={signUpState.error} />
          <FormError message={withdrawState.error} />
          <FormError message={adminAssignState.error} />
          <FormError message={deleteShiftState.error} />
          <FormError message={pdfError} />

          {events.map((event) => (
            <Panel key={event.id}>
              {/* Event header */}
              <PanelHeader className="flex-col items-start sm:flex-row">
                <div className="w-full sm:w-auto">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: event.eventType.color ?? "var(--accent)" }}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{event.eventType.name}</span>
                  </div>
                  <SectionTitle as="h3" className="mt-0.5">{event.name}</SectionTitle>
                  <p className="text-xs text-[var(--muted)]">{formatDate(event.startDate)} → {formatDate(event.endDate)}</p>
                  {event.costCenter ? <p className="text-xs text-[var(--muted)]">{event.costCenter.code}</p> : null}
                  {event.notes ? <p className="mt-1 text-xs text-[var(--muted)]">{event.notes}</p> : null}
                </div>
                <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={downloadingEventId === event.id}
                    onClick={() => handleDownloadPdf(event)}
                    className="grow sm:grow-0"
                  >
                    {downloadingEventId === event.id ? copy.downloadingPdf : copy.exportPdf}
                  </Button>
                  {canManageEvents ? (
                    <form action={deleteEventFormAction} className="grow sm:grow-0">
                      <input type="hidden" name="id" value={event.id} />
                      <Button type="submit" variant="destructive" disabled={isDeletingEvent} className="w-full sm:w-auto">
                        {copy.deleteEvent}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </PanelHeader>

              {/* Days */}
              <div className="divide-y divide-[var(--line)]">
                {event.days.map((day) => (
                  <div key={day.id} className={`px-5 py-4 ${day.isOff ? "opacity-50" : ""}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{formatDate(day.date)}</span>
                        {day.isOff ? <Badge tone="neutral">{copy.isOff}</Badge> : null}
                      </div>
                      {canManageEvents ? (
                        <form action={toggleDayOffFormAction}>
                          <input type="hidden" name="id" value={day.id} />
                          <Button type="submit" variant="ghost" size="sm" disabled={isTogglingDayOff}>
                            {day.isOff ? copy.toggleOn : copy.toggleOff}
                          </Button>
                        </form>
                      ) : null}
                    </div>

                    {/* Shifts */}
                    {!day.isOff ? (
                      <div className="mt-3 space-y-2">
                        {day.shifts.length === 0 ? (
                          <p className="text-xs text-[var(--muted)]">{copy.noShifts}</p>
                        ) : (
                          day.shifts.map((shift) => {
                            const signed = shift.assignments.find((a) => a.userId === accessId);
                            const spotsFilled = shift.assignments.length;
                            const isFull = spotsFilled >= shift.capacity;

                            return (
                              <div key={shift.id} className={cn(nestedSurfaceClasses, "overflow-hidden")}>
                                {/* On a phone a shift is a full-width card: the info block,
                                    then its actions stacked underneath. From sm — where the
                                    row has room again — it is back to one dense line. */}
                                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:py-2.5">
                                  <div className="space-y-0.5">
                                    <p className="text-sm font-semibold text-[var(--ink)]">{shift.role || "General"}</p>
                                    <p className="text-xs text-[var(--muted)]">{formatTime(shift.startTime)}–{formatTime(shift.endTime)}</p>
                                    <p className="text-xs text-[var(--muted)]">
                                      {spotsFilled}/{shift.capacity}{" "}
                                      {isFull ? (
                                        <span className="font-semibold text-rose-400">{copy.full}</span>
                                      ) : (
                                        <span>{shift.capacity - spotsFilled} {copy.spotsLeft}</span>
                                      )}
                                    </p>
                                    {/* Assigned staff names */}
                                    {shift.assignments.length > 0 ? (
                                      <p className="text-xs text-[var(--muted)]">
                                        {shift.assignments.map((a) => a.user.name).join(", ")}
                                      </p>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                    {isReadOnly ? null : signed ? (
                                      <form action={withdrawFormAction}>
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <Button type="submit" variant="destructive" size="sm" disabled={isWithdrawing} className="w-full sm:w-auto">
                                          {copy.withdraw}
                                        </Button>
                                      </form>
                                    ) : !isFull ? (
                                      <form action={signUpFormAction}>
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <Button type="submit" variant="primary" size="sm" disabled={isSigningUp} className="w-full sm:w-auto">
                                          {copy.signUp}
                                        </Button>
                                      </form>
                                    ) : null}

                                    {/* Admin: assign someone else */}
                                    {canManageEvents && !isFull ? (
                                      <form action={adminAssignFormAction} className="flex items-center gap-2">
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <div className="min-w-0 grow sm:w-40 sm:grow-0">
                                          <Select name="userId" defaultValue="" size="sm">
                                            <option value="" disabled>{copy.assignStaff}</option>
                                            {allUsers
                                              .filter((u) => !shift.assignments.some((a) => a.userId === u.id))
                                              .map((u) => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                              ))}
                                          </Select>
                                        </div>
                                        <IconButton type="submit" tone="accent" label={copy.assignStaff} disabled={isAdminAssigning}>
                                          <Plus />
                                        </IconButton>
                                      </form>
                                    ) : null}

                                    {/* Admin: delete the shift */}
                                    {canManageEvents ? (
                                      <form action={deleteShiftFormAction} className="self-end sm:self-auto">
                                        <input type="hidden" name="id" value={shift.id} />
                                        <IconButton type="submit" tone="delete" label={copy.deleteShift} disabled={isDeletingShift}>
                                          <Trash2 />
                                        </IconButton>
                                      </form>
                                    ) : null}
                                  </div>
                                </div>

                                {/* Admin: remove individual staff members */}
                                {canManageEvents && shift.assignments.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 border-t border-[var(--line)] px-4 py-2">
                                    {shift.assignments.map((a) => (
                                      <form key={a.id} action={withdrawFormAction} className="inline-flex">
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <input type="hidden" name="userId" value={a.userId} />
                                        <Chip action={<ChipRemoveButton label={copy.withdraw} disabled={isWithdrawing} />}>
                                          {a.user.name}
                                        </Chip>
                                      </form>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}

                        {/* Admin: add shift to this day */}
                        {canManageEvents ? (
                          <AddShiftForm
                            eventDayId={day.id}
                            existingShifts={day.shifts.map((shift) => ({ startTime: shift.startTime, endTime: shift.endTime }))}
                            copy={{
                              role: copy.role,
                              addShift: copy.addShift,
                              shiftOverlapWarning: copy.shiftOverlapWarning,
                            }}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
