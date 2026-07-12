"use client";

import { useActionState } from "react";

import { FormError } from "@/components/form-error";
import { initialActionState } from "@/lib/server-action-helpers";

import {
  adminAssignUserToShiftAction,
  createEventAction,
  createEventTypeAction,
  deleteEventAction,
  deleteEventTypeAction,
  deleteShiftAction,
  signUpForShiftAction,
  toggleEventDayOffAction,
  withdrawFromShiftAction,
} from "./actions";
import AddShiftForm from "./add-shift-form";

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
};

type Props = {
  isAdmin: boolean;
  accessId: string;
  eventTypes: EventTypeItem[];
  costCenters: CostCenterItem[];
  events: EventItem[];
  allUsers: UserItem[];
  copy: EventsCopy;
};

export default function EventsPageClient({ isAdmin, accessId, eventTypes, costCenters, events, allUsers, copy }: Props) {
  const [deleteEventTypeState, deleteEventTypeFormAction, isDeletingEventType] = useActionState(
    deleteEventTypeAction,
    initialActionState
  );
  const [createEventTypeState, createEventTypeFormAction, isCreatingEventType] = useActionState(
    createEventTypeAction,
    initialActionState
  );
  const [createEventState, createEventFormAction, isCreatingEvent] = useActionState(
    createEventAction,
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
  const [adminAssignState, adminAssignFormAction, isAdminAssigning] = useActionState(
    adminAssignUserToShiftAction,
    initialActionState
  );
  const [deleteShiftState, deleteShiftFormAction, isDeletingShift] = useActionState(
    deleteShiftAction,
    initialActionState
  );

  return (
    <div className="space-y-10">
      {/* ── Admin: Event types ────────────────────────────────────────────── */}
      {isAdmin ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{copy.eventTypes}</h2>
          <FormError message={deleteEventTypeState.error} />
          <div className="flex flex-wrap gap-2">
            {eventTypes.map((et) => (
              <form
                key={et.id}
                action={deleteEventTypeFormAction}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm"
              >
                <span>{et.name}</span>
                <input type="hidden" name="id" value={et.id} />
                <button
                  disabled={isDeletingEventType}
                  className="text-[var(--muted)] hover:text-rose-400 disabled:opacity-50"
                  title={copy.deleteEventType}
                  type="submit"
                >
                  ×
                </button>
              </form>
            ))}
          </div>
          <FormError message={createEventTypeState.error} />
          <form action={createEventTypeFormAction} className="flex flex-wrap items-end gap-2">
            <input
              type="text"
              name="name"
              required
              placeholder={copy.eventTypeName}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <input
              type="text"
              name="description"
              placeholder={copy.eventTypeDescription}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              disabled={isCreatingEventType}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
            >
              {copy.createEventType}
            </button>
          </form>
        </section>
      ) : null}

      {/* ── Admin: Create event ───────────────────────────────────────────── */}
      {isAdmin ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6 space-y-4">
          <h2 className="text-lg font-semibold">{copy.createEvent}</h2>
          {eventTypes.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{copy.noEventTypes}</p>
          ) : (
            <form action={createEventFormAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FormError message={createEventState.error} className="sm:col-span-2 lg:col-span-3" />
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--muted)]">{copy.eventName} *</span>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--muted)]">{copy.eventType} *</span>
                <select
                  name="eventTypeId"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value="" disabled>{copy.eventType}</option>
                  {eventTypes.map((et) => (
                    <option key={et.id} value={et.id}>{et.name}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--muted)]">{copy.costCenter}</span>
                <select
                  name="costCenterId"
                  defaultValue=""
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value="">—</option>
                  {costCenters.map((cc) => (
                    <option key={cc.id} value={cc.id}>{cc.code} {cc.name}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--muted)]">{copy.startDate} *</span>
                <input
                  type="date"
                  name="startDate"
                  required
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--muted)]">{copy.endDate} *</span>
                <input
                  type="date"
                  name="endDate"
                  required
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--muted)]">{copy.notes}</span>
                <input
                  type="text"
                  name="notes"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <button
                  disabled={isCreatingEvent}
                  className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
                >
                  {copy.createEvent}
                </button>
              </div>
            </form>
          )}
        </section>
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

          {events.map((event) => (
            <section key={event.id} className="overflow-hidden rounded-2xl border border-[var(--line)]">
              {/* Event header */}
              <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--panel-strong)] px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: event.eventType.color ?? "var(--accent)" }}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{event.eventType.name}</span>
                  </div>
                  <h3 className="mt-0.5 text-lg font-semibold">{event.name}</h3>
                  <p className="text-xs text-[var(--muted)]">{formatDate(event.startDate)} → {formatDate(event.endDate)}</p>
                  {event.costCenter ? <p className="text-xs text-[var(--muted)]">{event.costCenter.code}</p> : null}
                  {event.notes ? <p className="mt-1 text-xs text-[var(--muted)]">{event.notes}</p> : null}
                </div>
                {isAdmin ? (
                  <form action={deleteEventFormAction}>
                    <input type="hidden" name="id" value={event.id} />
                    <button disabled={isDeletingEvent} className="text-xs text-[var(--muted)] hover:text-rose-400 disabled:opacity-50">
                      {copy.deleteEvent}
                    </button>
                  </form>
                ) : null}
              </div>

              {/* Days */}
              <div className="divide-y divide-[var(--line)]">
                {event.days.map((day) => (
                  <div key={day.id} className={`px-5 py-4 ${day.isOff ? "opacity-50" : ""}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{formatDate(day.date)}</span>
                        {day.isOff ? (
                          <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                            {copy.isOff}
                          </span>
                        ) : null}
                      </div>
                      {isAdmin ? (
                        <form action={toggleDayOffFormAction}>
                          <input type="hidden" name="id" value={day.id} />
                          <button disabled={isTogglingDayOff} className="text-xs text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50">
                            {day.isOff ? copy.toggleOn : copy.toggleOff}
                          </button>
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
                              <div key={shift.id} className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
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

                                  <div className="flex flex-wrap items-center gap-2">
                                    {signed ? (
                                      <form action={withdrawFormAction}>
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <button
                                          disabled={isWithdrawing}
                                          className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                                        >
                                          {copy.withdraw}
                                        </button>
                                      </form>
                                    ) : !isFull ? (
                                      <form action={signUpFormAction}>
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <button
                                          disabled={isSigningUp}
                                          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
                                        >
                                          {copy.signUp}
                                        </button>
                                      </form>
                                    ) : null}

                                    {/* Admin: assign someone else */}
                                    {isAdmin && !isFull ? (
                                      <form action={adminAssignFormAction} className="flex items-center gap-1">
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <select
                                          name="userId"
                                          defaultValue=""
                                          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
                                        >
                                          <option value="" disabled>{copy.assignStaff}</option>
                                          {allUsers
                                            .filter((u) => !shift.assignments.some((a) => a.userId === u.id))
                                            .map((u) => (
                                              <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                        <button
                                          disabled={isAdminAssigning}
                                          className="rounded-md border border-[var(--line)] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--panel-strong)] disabled:opacity-50"
                                        >
                                          +
                                        </button>
                                      </form>
                                    ) : null}

                                    {/* Admin: remove staff, add shift, delete shift */}
                                    {isAdmin ? (
                                      <form action={deleteShiftFormAction}>
                                        <input type="hidden" name="id" value={shift.id} />
                                        <button disabled={isDeletingShift} className="text-xs text-[var(--muted)] hover:text-rose-400 disabled:opacity-50">×</button>
                                      </form>
                                    ) : null}
                                  </div>
                                </div>

                                {/* Admin: remove individual staff members */}
                                {isAdmin && shift.assignments.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 border-t border-[var(--line)] px-4 py-2">
                                    {shift.assignments.map((a) => (
                                      <form key={a.id} action={withdrawFormAction} className="inline-flex items-center gap-1">
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <input type="hidden" name="userId" value={a.userId} />
                                        <span className="text-xs">{a.user.name}</span>
                                        <button disabled={isWithdrawing} className="text-[var(--muted)] hover:text-rose-400 text-xs disabled:opacity-50">×</button>
                                      </form>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}

                        {/* Admin: add shift to this day */}
                        {isAdmin ? (
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
