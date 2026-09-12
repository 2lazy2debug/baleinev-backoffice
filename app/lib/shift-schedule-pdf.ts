// Categorical palette, fixed order (never cycled per-render) — validated for
// CVD separation and normal-vision contrast against a white page. Slots 3/4/5
// (aqua/yellow/magenta) sit under 3:1 contrast on white, so every colored cell
// also carries the role name in the legend — color is never the only signal.
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

const SLOT_MINUTES = 15;

export type ShiftScheduleShift = {
  id: string;
  startTime: string | null;
  endTime: string | null;
  noTime: boolean;
  role: string | null;
  capacity: number;
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
  legendHeading: string;
  timelessHeading: string;
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

function roleLabel(role: string | null) {
  return (role || "General").trim();
}

function timeToMinutes(value: string) {
  const [h, m] = value.split(":").map((part) => Number(part));
  return h * 60 + m;
}

/** Wall-clock label for a slot, wrapping an overnight slot back to `00:xx`. */
function formatSlotLabel(minutes: number) {
  const wrapped = minutes % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type TimedShift = ShiftScheduleShift & { startTime: string; endTime: string; start: number; end: number };

/** `endTime <= startTime` means the shift crosses midnight — its end lands after 24:00. */
function toTimedShift(shift: ShiftScheduleShift): TimedShift | null {
  if (shift.noTime || !shift.startTime || !shift.endTime) return null;
  const start = timeToMinutes(shift.startTime);
  let end = timeToMinutes(shift.endTime);
  if (end <= start) end += 24 * 60;
  return { ...shift, startTime: shift.startTime, endTime: shift.endTime, start, end };
}

type DayGrid = {
  slots: number[]; // slot start, in minutes from the day's own midnight — can exceed 1440
  rows: { name: string; runs: { shiftId: string; role: string; color: string; length: number }[] }[];
};

function buildDayGrid(timedShifts: TimedShift[], roleColors: Map<string, string>): DayGrid | null {
  if (timedShifts.length === 0) return null;

  const gridStart = Math.floor(Math.min(...timedShifts.map((s) => s.start)) / SLOT_MINUTES) * SLOT_MINUTES;
  const gridEnd = Math.ceil(Math.max(...timedShifts.map((s) => s.end)) / SLOT_MINUTES) * SLOT_MINUTES;

  const slots: number[] = [];
  for (let t = gridStart; t < gridEnd; t += SLOT_MINUTES) slots.push(t);

  const peopleMap = new Map<string, { name: string; shiftBySlot: Map<number, TimedShift> }>();
  for (const shift of timedShifts) {
    for (const { user } of shift.assignments) {
      const entry = peopleMap.get(user.id) ?? { name: user.name, shiftBySlot: new Map<number, TimedShift>() };
      for (const slot of slots) {
        if (slot >= shift.start && slot < shift.end) entry.shiftBySlot.set(slot, shift);
      }
      peopleMap.set(user.id, entry);
    }
  }

  const rows = Array.from(peopleMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((person) => {
      const runs: DayGrid["rows"][number]["runs"] = [];
      for (const slot of slots) {
        const shift = person.shiftBySlot.get(slot);
        const last = runs[runs.length - 1];
        if (shift && last && last.shiftId === shift.id) {
          last.length += 1;
        } else if (shift) {
          runs.push({ shiftId: shift.id, role: roleLabel(shift.role), color: roleColors.get(roleLabel(shift.role)) ?? FALLBACK_ROLE_COLOR, length: 1 });
        } else if (last && last.shiftId === "") {
          last.length += 1;
        } else {
          runs.push({ shiftId: "", role: "", color: "", length: 1 });
        }
      }
      return { name: person.name, runs };
    });

  return { slots, rows };
}

function buildGridTableHtml(grid: DayGrid, staffColumnLabel: string) {
  const hourGroups: { hour: number; span: number }[] = [];
  for (const slot of grid.slots) {
    const hour = Math.floor(slot / 60);
    const last = hourGroups[hourGroups.length - 1];
    if (last && last.hour === hour) {
      last.span += 1;
    } else {
      hourGroups.push({ hour, span: 1 });
    }
  }

  const hourHeaderCells = hourGroups
    .map((group) => `<th class="hour-header" colspan="${group.span}">${escapeHtml(formatSlotLabel(group.hour * 60))}</th>`)
    .join("");

  const tickCells = grid.slots
    .map((slot) => `<th class="tick-header">${slot % 60 === 0 ? "" : "&middot;"}</th>`)
    .join("");

  const bodyRows = grid.rows
    .map((row) => {
      const cells = row.runs
        .map((run) => {
          if (!run.shiftId) return `<td class="slot-cell" colspan="${run.length}"></td>`;
          return `<td class="slot-cell filled" colspan="${run.length}" style="background:${hexToRgba(run.color, 0.28)};border-color:${hexToRgba(run.color, 0.7)};">${escapeHtml(run.role)}</td>`;
        })
        .join("");
      return `<tr><td class="name-cell">${escapeHtml(row.name)}</td>${cells}</tr>`;
    })
    .join("");

  return `
    <table class="grid-table">
      <thead>
        <tr><th class="corner" rowspan="2">${escapeHtml(staffColumnLabel)}</th>${hourHeaderCells}</tr>
        <tr>${tickCells}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

function buildTimelessHtml(shifts: ShiftScheduleShift[], heading: string) {
  if (shifts.length === 0) return "";

  const rows = shifts
    .map((shift) => {
      const names = shift.assignments.map((a) => a.user.name).join(", ") || "—";
      return `<tr><td class="tl-role">${escapeHtml(roleLabel(shift.role))}</td><td class="tl-capacity">${shift.assignments.length}/${shift.capacity}</td><td class="tl-names">${escapeHtml(names)}</td></tr>`;
    })
    .join("");

  return `
    <div class="timeless">
      <h2>${escapeHtml(heading)}</h2>
      <table class="timeless-table">
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function buildLegendHtml(legend: { role: string; color: string }[], heading: string) {
  if (legend.length === 0) return "";

  const items = legend
    .map(
      (item) =>
        `<span class="legend-item"><span class="legend-swatch" style="background:${item.color};"></span>${escapeHtml(item.role)}</span>`,
    )
    .join("");

  return `<div class="legend"><h2>${escapeHtml(heading)}</h2><div class="legend-items">${items}</div></div>`;
}

export function renderShiftSchedulePdf(event: ShiftScheduleEvent, copy: ShiftSchedulePdfCopy) {
  const days = event.days.filter((day) => day.shifts.length > 0);

  const roles = Array.from(new Set(days.flatMap((day) => day.shifts.map((shift) => roleLabel(shift.role))))).sort(
    (a, b) => a.localeCompare(b),
  );
  const roleColors = new Map<string, string>(
    roles.map((role, index) => [role, CATEGORICAL_PALETTE[index] ?? FALLBACK_ROLE_COLOR]),
  );
  const legendHtml = buildLegendHtml(
    roles.map((role) => ({ role, color: roleColors.get(role) ?? FALLBACK_ROLE_COLOR })),
    copy.legendHeading,
  );

  const sectionsHtml =
    days.length === 0
      ? `<p class="empty-note">${escapeHtml(copy.noShifts)}</p>`
      : days
          .map((day, index) => {
            const timedShifts = day.shifts.map(toTimedShift).filter((s): s is TimedShift => s != null);
            const timelessShifts = day.shifts.filter((s) => s.noTime);
            const grid = buildDayGrid(timedShifts, roleColors);

            const gridHtml = grid ? buildGridTableHtml(grid, copy.staffColumn) : "";
            const timelessHtml = buildTimelessHtml(timelessShifts, copy.timelessHeading);
            const isLast = index === days.length - 1;

            return `
              <section class="day-page${isLast ? " last" : ""}">
                <h1>${escapeHtml(event.name)} — ${escapeHtml(formatDay(day.date))}</h1>
                ${index === 0 ? legendHtml : ""}
                ${gridHtml}
                ${timelessHtml}
              </section>
            `;
          })
          .join("");

  return {
    html: wrapHtmlDocument(sectionsHtml),
    footerHtml: buildFooterHtml(),
  };
}

function wrapHtmlDocument(bodyHtml: string) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 0; color: #0b0b0b; }
  h1 { font-size: 13px; font-weight: 700; margin: 0 0 6px; }
  h2 { font-size: 9px; font-weight: 700; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.02em; color: #52514e; }
  section.day-page { padding: 10px 12px; page-break-after: always; }
  section.day-page.last { page-break-after: auto; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }

  .grid-table th, .grid-table td { border: 1px solid #c3c2b7; padding: 2px; font-size: 7px; text-align: center; vertical-align: middle; overflow: hidden; }
  .grid-table th.corner { width: 90px; text-align: left; background: #f2f2ef; font-weight: 600; padding: 3px 4px; font-size: 8px; }
  .grid-table th.hour-header { background: #f2f2ef; font-weight: 600; font-size: 7.5px; }
  .grid-table th.tick-header { background: #f9f9f7; color: #a5a39c; font-weight: 400; height: 6px; }
  .grid-table td.name-cell { text-align: left; font-weight: 600; background: #f9f9f7; white-space: nowrap; padding: 3px 4px; font-size: 8px; }
  .grid-table td.slot-cell { padding: 1px; }
  .grid-table td.slot-cell.filled { border: 1px solid; font-size: 6.5px; white-space: nowrap; }

  .legend { margin-bottom: 8px; }
  .legend-items { display: flex; flex-wrap: wrap; }
  .legend-item { display: inline-flex; align-items: center; margin-right: 10px; margin-bottom: 3px; font-size: 8px; }
  .legend-swatch { display: inline-block; width: 7px; height: 7px; margin-right: 3px; border-radius: 1px; }

  .timeless { margin-top: 10px; }
  .timeless-table { width: auto; }
  .timeless-table td { border: 1px solid #c3c2b7; padding: 2px 6px; font-size: 8px; vertical-align: middle; }
  .timeless-table td.tl-role { font-weight: 600; white-space: nowrap; }
  .timeless-table td.tl-capacity { white-space: nowrap; text-align: center; }

  .empty-note { font-size: 11px; color: #52514e; padding: 10px 12px; }
</style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

function buildFooterHtml() {
  return `<div style="width:100%;text-align:right;font-size:7.5px;color:#52514e;padding:0 10mm;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </div>`;
}
