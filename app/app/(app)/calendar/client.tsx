"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type CalendarTask = {
  id: string;
  title: string;
  dueDate: string;
  href: string;
};

type CalendarAppointment = {
  id: string;
  createdById: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string | null;
};

type Copy = {
  title: string;
  subtitle: string;
  monthView: string;
  dayView: string;
  noItemsDay: string;
  tasks: string;
  appointments: string;
  taskPills: string;
  createAppointment: string;
  appointmentTitle: string;
  appointmentDescription: string;
  startsAt: string;
  endsAtOptional: string;
  inviteMode: string;
  inviteAll: string;
  invitePerson: string;
  inviteDepartment: string;
  person: string;
  department: string;
  selectPerson: string;
  selectDepartment: string;
  submitAppointment: string;
  today: string;
  previousMonth: string;
  nextMonth: string;
  detailsTitle: string;
  closeDetails: string;
  fromLabel: string;
  toLabel: string;
  editAppointment: string;
  deleteAppointment: string;
  saveAppointment: string;
  deleteAppointmentConfirm: string;
  actionFailed: string;
};

type Props = {
  copy: Copy;
  currentUserId: string;
  updateAppointmentAction: (formData: FormData) => Promise<void>;
  deleteAppointmentAction: (formData: FormData) => Promise<void>;
  tasks: CalendarTask[];
  appointments: CalendarAppointment[];
};

type DayTimelineItem = {
  id: string;
  kind: "task" | "appointment";
  title: string;
  subtitle?: string;
  href?: string;
  startMinute: number;
  endMinute: number;
};

function toDayKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

function clampMinute(value: number) {
  return Math.max(0, Math.min(24 * 60, value));
}

function minuteOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatDateTimeLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function CalendarPageClient({
  copy,
  currentUserId,
  updateAppointmentAction,
  deleteAppointmentAction,
  tasks,
  appointments,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentMonth, setCurrentMonth] = useState(() => toDayStart(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => toDayKey(new Date()));
  const [selectedAppointment, setSelectedAppointment] = useState<CalendarAppointment | null>(null);
  const [isEditingAppointment, setIsEditingAppointment] = useState(false);
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [appointmentDescription, setAppointmentDescription] = useState("");
  const [appointmentStartAt, setAppointmentStartAt] = useState("");
  const [appointmentEndAt, setAppointmentEndAt] = useState("");
  const [appointmentActionError, setAppointmentActionError] = useState<string | null>(null);

  const monthStart = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
    [currentMonth],
  );
  const monthEnd = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0),
    [currentMonth],
  );

  const monthDays = useMemo(() => {
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const cells: Array<{ isoDay: string; day: number; inMonth: boolean }> = [];

    for (let i = firstWeekday; i > 0; i -= 1) {
      const d = new Date(monthStart);
      d.setDate(d.getDate() - i);
        cells.push({ isoDay: toDayKey(d), day: d.getDate(), inMonth: false });
    }

    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
        cells.push({ isoDay: toDayKey(d), day, inMonth: true });
    }

    while (cells.length % 7 !== 0) {
      const d = new Date(monthEnd);
      d.setDate(d.getDate() + (cells.length % 7));
        cells.push({ isoDay: toDayKey(d), day: d.getDate(), inMonth: false });
    }

    return cells;
  }, [monthStart, monthEnd]);

  const taskCountsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      const key = toDayKey(parseIsoDate(task.dueDate));
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    return map;
  }, [tasks]);

  const appointmentCountsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const appointment of appointments) {
      const key = toDayKey(parseIsoDate(appointment.startAt));
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    return map;
  }, [appointments]);

  const dayTasks = useMemo(
    () => tasks
      .filter((task) => toDayKey(parseIsoDate(task.dueDate)) === selectedDay)
      .sort((a, b) => parseIsoDate(a.dueDate).getTime() - parseIsoDate(b.dueDate).getTime()),
    [tasks, selectedDay],
  );

  const dayAppointments = useMemo(
    () => appointments
      .filter((appointment) => toDayKey(parseIsoDate(appointment.startAt)) === selectedDay)
      .sort((a, b) => parseIsoDate(a.startAt).getTime() - parseIsoDate(b.startAt).getTime()),
    [appointments, selectedDay],
  );

  const timelineItems = useMemo(() => {
    const items: DayTimelineItem[] = [];

    for (const task of dayTasks) {
      const start = parseIsoDate(task.dueDate);
      const startMinute = clampMinute(minuteOfDay(start));
      const endMinute = clampMinute(startMinute + 45);

      items.push({
        id: task.id,
        kind: "task",
        title: task.title,
        href: task.href,
        startMinute,
        endMinute: Math.max(endMinute, startMinute + 20),
      });
    }

    for (const appointment of dayAppointments) {
      const start = parseIsoDate(appointment.startAt);
      const end = appointment.endAt ? parseIsoDate(appointment.endAt) : null;
      const startMinute = clampMinute(minuteOfDay(start));
      const endMinute = clampMinute(end ? minuteOfDay(end) : startMinute + 60);

      items.push({
        id: appointment.id,
        kind: "appointment",
        title: appointment.title,
        subtitle: appointment.description,
        startMinute,
        endMinute: Math.max(endMinute, startMinute + 20),
      });
    }

    const base = items.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

    const withColumns = base.map((item) => ({ ...item, column: 0, columnCount: 1 }));
    const columnEnds: number[] = [];

    withColumns.forEach((item) => {
      let assigned = -1;
      for (let index = 0; index < columnEnds.length; index += 1) {
        if (columnEnds[index] <= item.startMinute) {
          assigned = index;
          break;
        }
      }

      if (assigned === -1) {
        assigned = columnEnds.length;
        columnEnds.push(item.endMinute);
      } else {
        columnEnds[assigned] = item.endMinute;
      }

      item.column = assigned;
    });

    const overlaps = (a: (typeof withColumns)[number], b: (typeof withColumns)[number]) =>
      a.startMinute < b.endMinute && b.startMinute < a.endMinute;

    withColumns.forEach((item) => {
      const maxColumn = withColumns
        .filter((other) => overlaps(item, other))
        .reduce((max, other) => Math.max(max, other.column), 0);
      item.columnCount = Math.max(1, maxColumn + 1);
    });

    return withColumns;
  }, [dayAppointments, dayTasks]);

  const selectedDate = parseIsoDate(selectedDay);
  const canManageSelectedAppointment = selectedAppointment?.createdById === currentUserId;
  const HOUR_ROW_HEIGHT = 56;
  const MINUTE_HEIGHT = HOUR_ROW_HEIGHT / 60;
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const dayTimelineScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = dayTimelineScrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = 8 * HOUR_ROW_HEIGHT;
  }, [HOUR_ROW_HEIGHT, selectedDay]);

  function openAppointmentDetails(appointment: CalendarAppointment) {
    setSelectedAppointment(appointment);
    setIsEditingAppointment(false);
    setAppointmentActionError(null);
    setAppointmentTitle(appointment.title);
    setAppointmentDescription(appointment.description);
    setAppointmentStartAt(formatDateTimeLocalInput(appointment.startAt));
    setAppointmentEndAt(appointment.endAt ? formatDateTimeLocalInput(appointment.endAt) : "");
  }

  function closeAppointmentDetails() {
    setSelectedAppointment(null);
    setIsEditingAppointment(false);
    setAppointmentActionError(null);
  }

  function submitAppointmentUpdate() {
    if (!selectedAppointment) {
      return;
    }

    setAppointmentActionError(null);
    const formData = new FormData();
    formData.set("appointmentId", selectedAppointment.id);
    formData.set("title", appointmentTitle);
    formData.set("description", appointmentDescription);
    formData.set("startAt", appointmentStartAt);
    formData.set("endAt", appointmentEndAt);

    startTransition(async () => {
      try {
        await updateAppointmentAction(formData);
        closeAppointmentDetails();
        router.refresh();
      } catch {
        setAppointmentActionError(copy.actionFailed);
      }
    });
  }

  function submitAppointmentDelete() {
    if (!selectedAppointment) {
      return;
    }

    const confirmed = window.confirm(copy.deleteAppointmentConfirm);
    if (!confirmed) {
      return;
    }

    setAppointmentActionError(null);
    const formData = new FormData();
    formData.set("appointmentId", selectedAppointment.id);

    startTransition(async () => {
      try {
        await deleteAppointmentAction(formData);
        closeAppointmentDetails();
        router.refresh();
      } catch {
        setAppointmentActionError(copy.actionFailed);
      }
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-sm text-[var(--muted)]">{copy.subtitle}</p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">{copy.monthView}: {monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(currentMonth);
                  d.setMonth(d.getMonth() - 1);
                  setCurrentMonth(toDayStart(d));
                }}
                className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold hover:bg-[var(--panel)]"
              >
                {copy.previousMonth}
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(currentMonth);
                  d.setMonth(d.getMonth() + 1);
                  setCurrentMonth(toDayStart(d));
                }}
                className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold hover:bg-[var(--panel)]"
              >
                {copy.nextMonth}
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = toDayStart(new Date());
                  setCurrentMonth(now);
                  setSelectedDay(toDayKey(now));
                }}
                className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--accent-strong)]"
              >
                {copy.today}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-xs text-[var(--muted)]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((cell) => {
              const taskCount = taskCountsByDay.get(cell.isoDay) ?? 0;
              const appointmentCount = appointmentCountsByDay.get(cell.isoDay) ?? 0;
              const isSelected = cell.isoDay === selectedDay;
              const isToday = cell.isoDay === toDayKey(new Date());

              return (
                <button
                  key={cell.isoDay}
                  type="button"
                  onClick={() => setSelectedDay(cell.isoDay)}
                  className={`min-h-20 rounded-xl border p-2 text-left transition ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--panel)]"
                      : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)]/60"
                  } ${!cell.inMonth ? "opacity-45" : ""}`}
                >
                  <p className={`text-xs font-semibold ${isToday ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}>{cell.day}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {taskCount > 0 ? (
                      <span className="inline-flex rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        {taskCount} {copy.taskPills}
                      </span>
                    ) : null}
                    {appointmentCount > 0 ? (
                      <span className="inline-flex rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                        {appointmentCount} {copy.appointments}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
          <p className="text-sm font-semibold">
            {copy.dayView}: {selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long" })}
          </p>

          <div
            ref={dayTimelineScrollRef}
            className="max-h-[70vh] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]"
          >
            <div className="grid grid-cols-[64px_1fr]">
              <div>
                {hours.map((hour) => (
                  <div
                    key={`hour-label-${hour}`}
                    className="border-t border-[var(--line)] px-2 pt-1 text-right text-xs text-[var(--muted)]"
                    style={{ height: `${HOUR_ROW_HEIGHT}px` }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              <div className="relative" style={{ height: `${24 * HOUR_ROW_HEIGHT}px` }}>
                {hours.map((hour) => (
                  <div
                    key={`hour-line-${hour}`}
                    className="absolute left-0 right-0 border-t border-[var(--line)]"
                    style={{ top: `${hour * HOUR_ROW_HEIGHT}px` }}
                  />
                ))}

                {timelineItems.length === 0 ? (
                  <p className="absolute left-3 top-3 text-sm text-[var(--muted)]">{copy.noItemsDay}</p>
                ) : (
                  timelineItems.map((item) => {
                    const top = item.startMinute * MINUTE_HEIGHT;
                    const height = Math.max((item.endMinute - item.startMinute) * MINUTE_HEIGHT, 22);
                    const width = 100 / item.columnCount;
                    const left = item.column * width;

                    const blockClass = item.kind === "task"
                      ? "border-emerald-500/40 bg-emerald-500/15"
                      : "border-rose-400/40 bg-rose-400/15";
                    const tagClass = item.kind === "task"
                      ? "text-emerald-300"
                      : "text-rose-300";
                    const tag = item.kind === "task" ? copy.tasks : copy.appointments;
                    const blockStyle = {
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `calc(${left}% + 4px)`,
                      width: `calc(${width}% - 8px)`,
                    };

                    const content = (
                      <div
                        className={`absolute overflow-hidden rounded-lg border px-2 py-1 ${blockClass}`}
                        style={blockStyle}
                      >
                        <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${tagClass}`}>{tag}</p>
                        <p className="text-xs font-semibold leading-4">{item.title}</p>
                        {item.subtitle ? <p className="text-[11px] text-[var(--muted)] line-clamp-2">{item.subtitle}</p> : null}
                      </div>
                    );

                    if (item.href) {
                      return (
                      <a key={item.id} href={item.href} aria-label={item.title}>
                        {content}
                      </a>
                      );
                    }

                    if (item.kind === "appointment") {
                      const appointment = dayAppointments.find((candidate) => candidate.id === item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            if (appointment) {
                              openAppointmentDetails(appointment);
                            }
                          }}
                          className={`absolute overflow-hidden rounded-lg border px-2 py-1 text-left ${blockClass}`}
                          style={blockStyle}
                          aria-label={item.title}
                        >
                          <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${tagClass}`}>{tag}</p>
                          <p className="text-xs font-semibold leading-4">{item.title}</p>
                          {item.subtitle ? <p className="text-[11px] text-[var(--muted)] line-clamp-2">{item.subtitle}</p> : null}
                        </button>
                      );
                    }

                    return <div key={item.id}>{content}</div>;
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {selectedAppointment ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">{copy.detailsTitle}</h3>
              <button
                type="button"
                onClick={closeAppointmentDetails}
                className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold hover:bg-[var(--panel)]"
              >
                {copy.closeDetails}
              </button>
            </div>

            {isEditingAppointment ? (
              <div className="mt-4 space-y-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">{copy.appointmentTitle}</span>
                  <input
                    type="text"
                    value={appointmentTitle}
                    onChange={(event) => setAppointmentTitle(event.target.value)}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm font-medium">{copy.appointmentDescription}</span>
                  <textarea
                    rows={4}
                    value={appointmentDescription}
                    onChange={(event) => setAppointmentDescription(event.target.value)}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{copy.startsAt}</span>
                    <input
                      type="datetime-local"
                      value={appointmentStartAt}
                      onChange={(event) => setAppointmentStartAt(event.target.value)}
                      className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{copy.endsAtOptional}</span>
                    <input
                      type="datetime-local"
                      value={appointmentEndAt}
                      onChange={(event) => setAppointmentEndAt(event.target.value)}
                      className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{copy.appointmentTitle}</p>
                  <p className="font-semibold">{selectedAppointment.title}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{copy.appointmentDescription}</p>
                  <p className="whitespace-pre-line">{selectedAppointment.description}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{copy.fromLabel}</p>
                  <p>{new Date(selectedAppointment.startAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{copy.toLabel}</p>
                  <p>{selectedAppointment.endAt ? new Date(selectedAppointment.endAt).toLocaleString() : "-"}</p>
                </div>
              </div>
            )}

            {appointmentActionError ? <p className="mt-3 text-sm text-rose-300">{appointmentActionError}</p> : null}

            {canManageSelectedAppointment ? (
              <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                {isEditingAppointment ? (
                  <button
                    type="button"
                    onClick={submitAppointmentUpdate}
                    disabled={isPending}
                    className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
                  >
                    {copy.saveAppointment}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingAppointment(true)}
                    disabled={isPending}
                    className="rounded-full border border-[var(--line)] px-4 py-2 text-xs font-semibold hover:bg-[var(--panel)] disabled:opacity-60"
                  >
                    {copy.editAppointment}
                  </button>
                )}

                <button
                  type="button"
                  onClick={submitAppointmentDelete}
                  disabled={isPending}
                  className="rounded-full border border-rose-300 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-950/40 disabled:opacity-60"
                >
                  {copy.deleteAppointment}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

    </div>
  );
}
