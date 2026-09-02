"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, FileText, Link2, Pencil, Plus, Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { Badge, Button, Chip, ChipRemoveButton, IconButton, Panel, PanelHeader, SectionTitle, Select, cn, nestedSurfaceClasses, scrollToBelowTopBar } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import {
  adminAssignUserToShiftAction,
  deleteEventAction,
  deleteShiftAction,
  signUpForShiftAction,
  toggleEventDayOffAction,
  withdrawFromShiftAction,
} from "./actions";
import AddShiftForm from "./add-shift-form";
import EditShiftForm from "./edit-shift-form";

/**
 * A shared link is `/events#event-<id>`: the whole point is that staff open it
 * and land on their event instead of scrolling a season's worth of panels. The
 * prefix keeps the anchor from colliding with any other id on the page.
 */
const eventAnchorPrefix = "event-";

function eventAnchorId(eventId: string) {
  return `${eventAnchorPrefix}${eventId}`;
}

function formatTime(t: string) {
  return t.slice(0, 5);
}

function formatDate(d: Date | string) {
  return new Date(d).toISOString().slice(0, 10);
}

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
  days: EventDayItem[];
};

type EventsCopy = {
  noEvents: string;
  deleteEvent: string;
  collapseEvent: string;
  expandEvent: string;
  editShift: string;
  deleteShift: string;
  isOff: string;
  toggleOn: string;
  toggleOff: string;
  noShifts: string;
  full: string;
  withdraw: string;
  signUp: string;
  assignStaff: string;
  role: string;
  addShift: string;
  shiftOverlapWarning: string;
  exportPdf: string;
  downloadingPdf: string;
  copyEventLink: string;
  eventLinkCopied: string;
  eventLinkCopyFailed: string;
};

type Props = {
  isAdmin: boolean;
  accessId: string;
  events: EventItem[];
  allUsers: UserItem[];
  copy: EventsCopy;
  shellCopy: { save: string; cancel: string };
};

export default function EventsPageClient({
  isAdmin,
  accessId,
  events,
  allUsers,
  copy,
  shellCopy,
}: Props) {
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

  // Collapsing is a reading aid, not a permission: everyone gets it, and an
  // event starts open so the page looks the way it always has.
  const [collapsedEventIds, setCollapsedEventIds] = useState<ReadonlySet<string>>(new Set());

  function toggleEventCollapsed(eventId: string) {
    setCollapsedEventIds((current) => {
      const next = new Set(current);
      if (!next.delete(eventId)) next.add(eventId);
      return next;
    });
  }

  // One shift at a time reads as fields instead of labels — the journal table's
  // rule, so a row never turns into an editor while another one is open.
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  // One line for whatever the header's client-side actions report — the PDF
  // fetch and the link copy both fail the same way, in the same place.
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadingEventId, setDownloadingEventId] = useState<string | null>(null);
  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);

  // Landing from a shared link. The browser scrolls to an anchor on its own, but
  // not once hydration has moved the page under it — and on a column of
  // near-identical panels nothing would say which one was meant.
  useEffect(() => {
    function focusHashedEvent() {
      const anchorId = window.location.hash.slice(1);
      if (!anchorId.startsWith(eventAnchorPrefix)) return;

      const target = document.getElementById(anchorId);
      if (!target) return;

      scrollToBelowTopBar(target);
      setHighlightedEventId(anchorId.slice(eventAnchorPrefix.length));
    }

    focusHashedEvent();
    window.addEventListener("hashchange", focusHashedEvent);
    return () => window.removeEventListener("hashchange", focusHashedEvent);
  }, []);

  // The ring says "this one", then gets out of the way — left on, it would read
  // as selection state.
  useEffect(() => {
    if (!highlightedEventId) return;
    const timer = window.setTimeout(() => setHighlightedEventId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [highlightedEventId]);

  useEffect(() => {
    if (!copiedEventId) return;
    const timer = window.setTimeout(() => setCopiedEventId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedEventId]);

  async function handleCopyLink(event: EventItem) {
    const anchor = `#${eventAnchorId(event.id)}`;
    // Put it in the address bar first, so the failure message below is true.
    window.history.replaceState(null, "", anchor);

    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}${anchor}`);
      setActionError(null);
      setCopiedEventId(event.id);
    } catch {
      setActionError(copy.eventLinkCopyFailed);
    }
  }

  async function handleDownloadPdf(event: EventItem) {
    setDownloadingEventId(event.id);
    setActionError(null);

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
      setActionError(err instanceof Error ? err.message : "Could not generate PDF.");
    } finally {
      setDownloadingEventId(null);
    }
  }

  return (
    <div className="space-y-4 lg:space-y-8">
      {/* ── Events list ──────────────────────────────────────────────────── */}
      {events.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{copy.noEvents}</p>
      ) : (
        <div className="space-y-4 lg:space-y-8">
          <FormError message={deleteEventState.error} />
          <FormError message={toggleDayOffState.error} />
          <FormError message={signUpState.error} />
          <FormError message={withdrawState.error} />
          <FormError message={adminAssignState.error} />
          <FormError message={deleteShiftState.error} />
          <FormError message={actionError} />

          {events.map((event) => {
            const isCollapsed = collapsedEventIds.has(event.id);
            // One button, drawn where the breakpoint puts it: level with the
            // event's name on a phone — where the actions wrap to a second row
            // and burying "collapse" at the end of them defeats the point of
            // collapsing — and last in the action row once there is a row.
            const collapseButton = (
              <IconButton
                size="md"
                tone="neutral"
                label={isCollapsed ? copy.expandEvent : copy.collapseEvent}
                aria-expanded={!isCollapsed}
                onClick={() => toggleEventCollapsed(event.id)}
              >
                {isCollapsed ? <ChevronDown /> : <ChevronUp />}
              </IconButton>
            );

            return (
              <Panel
                key={event.id}
                /* The link target. `scroll-mt` is the floor for the browser's own
                   anchor jump; <scrollToBelowTopBar> then measures the real bar. */
                id={eventAnchorId(event.id)}
                className={cn(
                  "scroll-mt-24 lg:scroll-mt-4",
                  highlightedEventId === event.id ? "ring-1 ring-[var(--accent)]" : undefined,
                )}
              >
                {/* Event header */}
                <PanelHeader className="flex-col items-start sm:flex-row">
                  <div className="flex w-full items-start justify-between gap-2 sm:w-auto sm:justify-start">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: event.eventType.color ?? "var(--accent)" }}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{event.eventType.name}</span>
                      </div>
                      <SectionTitle as="h3" className="mt-0.5">{event.name}</SectionTitle>
                      <p className="text-xs text-[var(--muted)]">{formatDate(event.startDate)} → {formatDate(event.endDate)}</p>
                      {event.notes ? <p className="mt-1 text-xs text-[var(--muted)]">{event.notes}</p> : null}
                    </div>
                    <div className="shrink-0 sm:hidden">{collapseButton}</div>
                  </div>
                  <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
                    <Button
                      type="button"
                      variant="secondary"
                      icon={<FileText />}
                      compactOnMobile
                      disabled={downloadingEventId === event.id}
                      onClick={() => handleDownloadPdf(event)}
                    >
                      {downloadingEventId === event.id ? copy.downloadingPdf : copy.exportPdf}
                    </Button>
                    {/* Copies `/events#event-<id>` — the same action for everyone,
                        since reading an event is not a permission. */}
                    <IconButton
                      size="md"
                      tone={copiedEventId === event.id ? "save" : "neutral"}
                      label={copiedEventId === event.id ? copy.eventLinkCopied : copy.copyEventLink}
                      onClick={() => handleCopyLink(event)}
                    >
                      {copiedEventId === event.id ? <Check /> : <Link2 />}
                    </IconButton>
                    {canManageEvents ? (
                      <form action={deleteEventFormAction}>
                        <input type="hidden" name="id" value={event.id} />
                        <Button type="submit" variant="destructive" disabled={isDeletingEvent}>
                          {copy.deleteEvent}
                        </Button>
                      </form>
                    ) : null}
                    {/* Last in the row from `sm` up; on a phone it is already up
                        beside the title. */}
                    <div className="hidden sm:block">{collapseButton}</div>
                  </div>
                </PanelHeader>

                {/* Days — the header is the whole event once collapsed. */}
                {isCollapsed ? null : (
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

                                const isEditingShift = editingShiftId === shift.id;

                                return (
                                  <div
                                    key={shift.id}
                                    className={cn(
                                      nestedSurfaceClasses,
                                      "overflow-hidden",
                                      isEditingShift ? "bg-[var(--panel-strong)]" : undefined,
                                    )}
                                  >
                                    {isEditingShift ? (
                                      <div className="px-4 py-3 sm:py-2.5">
                                        <EditShiftForm
                                          shift={{
                                            id: shift.id,
                                            startTime: shift.startTime,
                                            endTime: shift.endTime,
                                            role: shift.role,
                                            capacity: shift.capacity,
                                            assignedCount: spotsFilled,
                                          }}
                                          otherShifts={day.shifts
                                            .filter((other) => other.id !== shift.id)
                                            .map((other) => ({ startTime: other.startTime, endTime: other.endTime }))}
                                          onDone={() => setEditingShiftId(null)}
                                          copy={{
                                            role: copy.role,
                                            shiftOverlapWarning: copy.shiftOverlapWarning,
                                            save: shellCopy.save,
                                            cancel: shellCopy.cancel,
                                          }}
                                        />
                                      </div>
                                    ) : (
                                      /* On a phone a shift is a full-width card: the info block,
                                         then its actions stacked underneath. From sm — where the
                                         row has room again — it is back to one dense line. */
                                      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:py-2.5">
                                        <div className="space-y-0.5">
                                          <p className="text-sm font-semibold text-[var(--ink)]">{shift.role || "General"}</p>
                                          {/* The one number anyone scans this list for. */}
                                          <p className="text-xs font-semibold text-[var(--muted)]">{formatTime(shift.startTime)}–{formatTime(shift.endTime)}</p>
                                          <p className="text-xs text-[var(--muted)]">
                                            {spotsFilled}/{shift.capacity}{" "}
                                            {isFull ? <span className="font-semibold text-rose-400">{copy.full}</span> : null}
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

                                          {/* Admin: edit the shift in place, then delete it */}
                                          {canManageEvents ? (
                                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                              <IconButton
                                                tone="accent"
                                                label={copy.editShift}
                                                onClick={() => setEditingShiftId(shift.id)}
                                              >
                                                <Pencil />
                                              </IconButton>
                                              <form action={deleteShiftFormAction}>
                                                <input type="hidden" name="id" value={shift.id} />
                                                <IconButton type="submit" tone="delete" label={copy.deleteShift} disabled={isDeletingShift}>
                                                  <Trash2 />
                                                </IconButton>
                                              </form>
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    )}

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
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
