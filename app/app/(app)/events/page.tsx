import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

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

export default async function EventsPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const isAdmin = access.role === "ADMIN";

  const [eventTypes, activeEdition, allUsers] = await Promise.all([
    prisma.eventType.findMany({ orderBy: { name: "asc" } }),
    prisma.edition.findFirst({
      where: { isActive: true },
      include: {
        events: {
          orderBy: { startDate: "asc" },
          include: {
            eventType: true,
            costCenter: true,
            days: {
              orderBy: { date: "asc" },
              include: {
                shifts: {
                  orderBy: { startTime: "asc" },
                  include: {
                    assignments: {
                      include: { user: { select: { id: true, name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
        costCenters: { orderBy: { code: "asc" } },
      },
    }),
    isAdmin ? prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.events.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.events.title}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">{copy.common.noActiveEdition}</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.events.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.events.title} — {activeEdition.name}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">{copy.events.subtitle}</p>
      </header>

      {/* ── Admin: Event types ────────────────────────────────────────────── */}
      {isAdmin ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{copy.events.eventTypes}</h2>
          <div className="flex flex-wrap gap-2">
            {eventTypes.map((et) => (
              <form key={et.id} action={deleteEventTypeAction} className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm">
                <span>{et.name}</span>
                <input type="hidden" name="id" value={et.id} />
                <button
                  className="text-[var(--muted)] hover:text-rose-400"
                  title={copy.events.deleteEventType}
                  type="submit"
                >
                  ×
                </button>
              </form>
            ))}
          </div>
          <form action={createEventTypeAction} className="flex flex-wrap items-end gap-2">
            <input
              type="text"
              name="name"
              required
              placeholder={copy.events.eventTypeName}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <input
              type="text"
              name="description"
              placeholder={copy.events.eventTypeDescription}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
              {copy.events.createEventType}
            </button>
          </form>
        </section>
      ) : null}

      {/* ── Admin: Create event ───────────────────────────────────────────── */}
      {isAdmin ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6 space-y-4">
          <h2 className="text-lg font-semibold">{copy.events.createEvent}</h2>
          {eventTypes.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{copy.events.noEventTypes}</p>
          ) : (
          <form action={createEventAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.events.eventName} *</span>
              <input
                type="text"
                name="name"
                required
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.events.eventType} *</span>
              <select
                name="eventTypeId"
                required
                defaultValue=""
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              >
                <option value="" disabled>{copy.events.eventType}</option>
                {eventTypes.map((et) => (
                  <option key={et.id} value={et.id}>{et.name}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.events.costCenter}</span>
              <select
                name="costCenterId"
                defaultValue=""
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              >
                <option value="">—</option>
                {activeEdition.costCenters.map((cc) => (
                  <option key={cc.id} value={cc.id}>{cc.code} {cc.name}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.events.startDate} *</span>
              <input
                type="date"
                name="startDate"
                required
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.events.endDate} *</span>
              <input
                type="date"
                name="endDate"
                required
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.events.notes}</span>
              <input
                type="text"
                name="notes"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <button className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
                {copy.events.createEvent}
              </button>
            </div>
          </form>
          )}
        </section>
      ) : null}

      {/* ── Events list ──────────────────────────────────────────────────── */}
      {activeEdition.events.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{copy.events.noEvents}</p>
      ) : (
        <div className="space-y-8">
          {activeEdition.events.map((event) => (
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
                  <form action={deleteEventAction}>
                    <input type="hidden" name="id" value={event.id} />
                    <button className="text-xs text-[var(--muted)] hover:text-rose-400">{copy.events.deleteEvent}</button>
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
                            {copy.events.isOff}
                          </span>
                        ) : null}
                      </div>
                      {isAdmin ? (
                        <form action={toggleEventDayOffAction}>
                          <input type="hidden" name="id" value={day.id} />
                          <button className="text-xs text-[var(--muted)] hover:text-[var(--ink)]">
                            {day.isOff ? copy.events.toggleOn : copy.events.toggleOff}
                          </button>
                        </form>
                      ) : null}
                    </div>

                    {/* Shifts */}
                    {!day.isOff ? (
                      <div className="mt-3 space-y-2">
                        {day.shifts.length === 0 ? (
                          <p className="text-xs text-[var(--muted)]">{copy.events.noShifts}</p>
                        ) : (
                          day.shifts.map((shift) => {
                            const signed = shift.assignments.find((a) => a.userId === access.id);
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
                                        <span className="font-semibold text-rose-400">{copy.events.full}</span>
                                      ) : (
                                        <span>{shift.capacity - spotsFilled} {copy.events.spotsLeft}</span>
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
                                      <form action={withdrawFromShiftAction}>
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <button className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-950/40">
                                          {copy.events.withdraw}
                                        </button>
                                      </form>
                                    ) : !isFull ? (
                                      <form action={signUpForShiftAction}>
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <button className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-strong)]">
                                          {copy.events.signUp}
                                        </button>
                                      </form>
                                    ) : null}

                                    {/* Admin: assign someone else */}
                                    {isAdmin && !isFull ? (
                                      <form action={adminAssignUserToShiftAction} className="flex items-center gap-1">
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <select
                                          name="userId"
                                          defaultValue=""
                                          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
                                        >
                                          <option value="" disabled>{copy.events.assignStaff}</option>
                                          {allUsers
                                            .filter((u) => !shift.assignments.some((a) => a.userId === u.id))
                                            .map((u) => (
                                              <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                        <button className="rounded-md border border-[var(--line)] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--panel-strong)]">
                                          +
                                        </button>
                                      </form>
                                    ) : null}

                                    {/* Admin: remove staff, add shift, delete shift */}
                                    {isAdmin ? (
                                      <form action={deleteShiftAction}>
                                        <input type="hidden" name="id" value={shift.id} />
                                        <button className="text-xs text-[var(--muted)] hover:text-rose-400">×</button>
                                      </form>
                                    ) : null}
                                  </div>
                                </div>

                                {/* Admin: remove individual staff members */}
                                {isAdmin && shift.assignments.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 border-t border-[var(--line)] px-4 py-2">
                                    {shift.assignments.map((a) => (
                                      <form key={a.id} action={withdrawFromShiftAction} className="inline-flex items-center gap-1">
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <input type="hidden" name="userId" value={a.userId} />
                                        <span className="text-xs">{a.user.name}</span>
                                        <button className="text-[var(--muted)] hover:text-rose-400 text-xs">×</button>
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
                              role: copy.events.role,
                              addShift: copy.events.addShift,
                              shiftOverlapWarning: copy.events.shiftOverlapWarning,
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
