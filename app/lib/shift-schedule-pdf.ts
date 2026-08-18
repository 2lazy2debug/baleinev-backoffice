// Categorical palette, fixed order (never cycled per-render) — validated for
// CVD separation and normal-vision contrast against a white page. Slots 3/4/5
// (aqua/yellow/magenta) sit under 3:1 contrast on white, so every colored cell
// also carries the role name as text — color is never the only signal.
const CATEGORICAL_PALETTE = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];
const FALLBACK_ROLE_COLOR = "#898781"; // muted — used once the 8 slots are exhausted

export type ShiftScheduleShift = {
  id: string;
  startTime: string;
  endTime: string;
  role: string | null;
  assignments: { user: { id: string; name: string } }[];
};

export type ShiftScheduleDay = {
  id: string;
  date: Date;
  shifts: ShiftScheduleShift[];
};

export type ShiftScheduleEvent = {
  name: string;
  days: ShiftScheduleDay[];
};

export type ShiftSchedulePdfCopy = {
  staffColumn: string;
  noShifts: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatDay(value: Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

function roleLabel(role: string | null) {
  return (role || "General").trim();
}

type Column = {
  key: string;
  dayId: string;
  dayLabel: string;
  timeLabel: string;
  role: string;
  color: string;
};

export function renderShiftSchedulePdf(event: ShiftScheduleEvent, copy: ShiftSchedulePdfCopy) {
  const days = event.days.filter((day) => day.shifts.length > 0);

  const roles = Array.from(new Set(days.flatMap((day) => day.shifts.map((shift) => roleLabel(shift.role))))).sort(
    (a, b) => a.localeCompare(b),
  );
  const roleColors = new Map<string, string>(
    roles.map((role, index) => [role, CATEGORICAL_PALETTE[index] ?? FALLBACK_ROLE_COLOR]),
  );

  const columns: Column[] = days.flatMap((day) =>
    day.shifts.map((shift) => ({
      key: shift.id,
      dayId: day.id,
      dayLabel: formatDay(day.date),
      timeLabel: `${formatTime(shift.startTime)}–${formatTime(shift.endTime)}`,
      role: roleLabel(shift.role),
      color: roleColors.get(roleLabel(shift.role)) ?? FALLBACK_ROLE_COLOR,
    })),
  );

  const peopleMap = new Map<string, { name: string; cells: Set<string> }>();
  for (const day of days) {
    for (const shift of day.shifts) {
      for (const { user } of shift.assignments) {
        const entry = peopleMap.get(user.id) ?? { name: user.name, cells: new Set<string>() };
        entry.cells.add(shift.id);
        peopleMap.set(user.id, entry);
      }
    }
  }
  const people = Array.from(peopleMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const contentHtml =
    columns.length === 0
      ? `<p class="empty-note">${escapeHtml(copy.noShifts)}</p>`
      : buildTableHtml(columns, people, copy.staffColumn);

  return {
    html: wrapHtmlDocument(event.name, contentHtml),
    footerHtml: buildFooterHtml(roles.map((role) => ({ role, color: roleColors.get(role) ?? FALLBACK_ROLE_COLOR }))),
  };
}

function buildTableHtml(
  columns: Column[],
  people: { name: string; cells: Set<string> }[],
  staffColumnLabel: string,
) {
  const dayGroups: { dayId: string; dayLabel: string; span: number }[] = [];
  for (const col of columns) {
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.dayId === col.dayId) {
      last.span += 1;
    } else {
      dayGroups.push({ dayId: col.dayId, dayLabel: col.dayLabel, span: 1 });
    }
  }

  const dayHeaderCells = dayGroups
    .map((group) => `<th class="day-header" colspan="${group.span}">${escapeHtml(group.dayLabel)}</th>`)
    .join("");

  const slotHeaderCells = columns
    .map((col) => `<th class="slot-header">${escapeHtml(col.timeLabel)}<br/>${escapeHtml(col.role)}</th>`)
    .join("");

  const bodyRows = people.length
    ? people
        .map((person) => {
          const cells = columns
            .map((col) => {
              if (!person.cells.has(col.key)) {
                return `<td class="slot-cell"></td>`;
              }
              return `<td class="slot-cell"><span class="chip" style="background:${hexToRgba(col.color, 0.22)};border:1px solid ${hexToRgba(col.color, 0.6)};">${escapeHtml(col.role)}</span></td>`;
            })
            .join("");
          return `<tr><td class="name-cell">${escapeHtml(person.name)}</td>${cells}</tr>`;
        })
        .join("")
    : "";

  return `
    <table>
      <thead>
        <tr><th class="corner" rowspan="2">${escapeHtml(staffColumnLabel)}</th>${dayHeaderCells}</tr>
        <tr>${slotHeaderCells}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

function wrapHtmlDocument(eventName: string, bodyHtml: string) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 10px 12px; color: #0b0b0b; }
  h1 { font-size: 15px; font-weight: 700; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #c3c2b7; padding: 3px 4px; font-size: 8px; text-align: center; vertical-align: middle; }
  th.corner { width: 100px; text-align: left; background: #f2f2ef; font-weight: 600; }
  th.day-header { background: #f2f2ef; font-weight: 600; font-size: 9px; }
  th.slot-header { background: #f9f9f7; font-weight: 500; color: #52514e; line-height: 1.4; }
  td.name-cell { text-align: left; font-weight: 600; background: #f9f9f7; white-space: nowrap; }
  td.slot-cell { padding: 2px; }
  .chip { display: inline-block; width: 100%; border-radius: 3px; padding: 2px 3px; font-size: 7.5px; color: #0b0b0b; }
  .empty-note { font-size: 11px; color: #52514e; }
</style>
</head>
<body>
  <h1>${escapeHtml(eventName)}</h1>
  ${bodyHtml}
</body>
</html>`;
}

function buildFooterHtml(legend: { role: string; color: string }[]) {
  const legendItems = legend
    .map(
      (item) =>
        `<span style="display:inline-flex;align-items:center;margin-right:10px;"><span style="display:inline-block;width:7px;height:7px;background:${item.color};margin-right:3px;border-radius:1px;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></span>${escapeHtml(item.role)}</span>`,
    )
    .join("");

  return `<div style="width:100%;font-size:7.5px;color:#52514e;display:flex;align-items:center;justify-content:space-between;padding:0 10mm;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
    <div style="display:flex;flex-wrap:wrap;">${legendItems}</div>
    <div><span class="pageNumber"></span> / <span class="totalPages"></span></div>
  </div>`;
}
