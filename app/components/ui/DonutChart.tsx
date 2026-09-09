import { cn } from "./cn";

/**
 * The eight categorical slots from globals.css, in the order they are assigned.
 * Fixed order is the colour-blindness mechanism, not a style choice — the set
 * was validated as a sequence against `--page`, so a slice never picks a hue by
 * its rank and a ninth category never invents one. Past eight the tail folds
 * into `--chart-other`, the grey de-emphasis slot.
 */
const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
] as const;

const OTHER = "var(--chart-other)";

/** Geometry of the ring, in the 100×100 viewBox the SVG below draws in. */
const RADIUS = 40;
const THICKNESS = 15;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface gap between two slices, so adjacent fills never touch. */
const GAP = 1.6;

export type DonutSlice = { label: string; value: number };

type DonutChartProps = {
  data: DonutSlice[];
  /**
   * The categories that own a colour slot, in slot order. Two charts of the
   * same dimension must be given the same list, or a category changes colour
   * between them purely because it ranks differently — colour has to follow the
   * entity, never its rank. Anything outside the list folds into "other".
   *
   * Omit it and each chart ranks its own data, which is only safe when the
   * chart stands alone.
   */
  order?: readonly string[];
  /** Formats a value for the legend and the hover title. */
  format: (value: number) => string;
  /** Label for the folded tail once there are more categories than slots. */
  otherLabel: string;
  /** Shown instead of the ring when every value is zero. */
  emptyLabel: string;
  className?: string;
};

/**
 * The categories that get their own colour, ranked by total weight across every
 * side they appear on.
 *
 * This ranking is also the order slices are drawn in, and that is deliberate:
 * the palette was validated on *adjacent* pairs, and only its first three slots
 * survive arbitrary adjacency. Sorting each ring by its own values would put
 * unvalidated pairs next to each other — and would repaint a category between
 * two charts. So the ring follows the slots, which means a legend can be
 * slightly out of value order when a category outranks another on the combined
 * total but not on the side being shown. That is the trade, and it is the right
 * way round: a stable colour is worth more than a perfectly descending list.
 */
export function colourOrder(entries: DonutSlice[]): string[] {
  const weight = new Map<string, number>();
  for (const entry of entries) {
    weight.set(entry.label, (weight.get(entry.label) ?? 0) + Math.abs(entry.value));
  }
  return [...weight.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, SERIES.length)
    .map(([label]) => label);
}

/**
 * A donut for part-to-whole, with the legend carrying the name and the value of
 * every slice. The legend is not decoration: it is what keeps identity from
 * resting on colour alone, which is why there is no version of this without it.
 *
 * Slices only ever encode positive magnitudes — feed it charges or earnings,
 * never a net that can go below zero.
 */
export function DonutChart({ data, order, format, otherLabel, emptyLabel, className }: DonutChartProps) {
  const present = data.filter((slice) => slice.value > 0);
  const slots = order ?? colourOrder(present);

  // Past the last slot the tail becomes one grey "other" slice rather than a
  // ninth hue — a generated hue is indistinguishable from an existing one.
  const named = present
    .filter((slice) => slots.includes(slice.label))
    .sort((a, b) => slots.indexOf(a.label) - slots.indexOf(b.label));
  const tail = present.filter((slice) => !slots.includes(slice.label));
  const slices = [
    ...named.map((slice) => ({ ...slice, color: SERIES[slots.indexOf(slice.label)] })),
    ...(tail.length > 0
      ? [{ label: otherLabel, value: tail.reduce((sum, slice) => sum + slice.value, 0), color: OTHER }]
      : []),
  ];

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return <p className={cn("text-sm text-[var(--muted)]", className)}>{emptyLabel}</p>;
  }

  // A lone slice is a closed ring: opening a gap in it would draw a notch that
  // reads as a second, tiny category.
  const gap = slices.length > 1 ? GAP : 0;
  let consumed = 0;

  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5", className)}>
      <svg
        viewBox="0 0 100 100"
        role="img"
        className="h-32 w-32 shrink-0 self-center sm:h-36 sm:w-36"
      >
        {slices.map((slice) => {
          const length = (slice.value / total) * CIRCUMFERENCE;
          const dash = Math.max(length - gap, 0.5);
          const offset = -consumed;
          consumed += length;
          const share = ((slice.value / total) * 100).toFixed(1);

          return (
            <circle
              key={slice.label}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke={slice.color}
              strokeWidth={THICKNESS}
              strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
              strokeDashoffset={offset}
              transform="rotate(-90 50 50)"
              className="transition-opacity hover:opacity-75"
            >
              <title>{`${slice.label} — ${format(slice.value)} (${share}%)`}</title>
            </circle>
          );
        })}
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{slice.label}</span>
            <span className="shrink-0 tabular-nums text-[var(--muted)]">
              {((slice.value / total) * 100).toFixed(0)}%
            </span>
            <span className="shrink-0 tabular-nums font-medium text-[var(--ink)]">
              {format(slice.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
