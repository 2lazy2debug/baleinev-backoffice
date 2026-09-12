import { PosCellColor } from "@prisma/client";

/**
 * A tile's color is purely a background wash, drawn from the app's eight
 * categorical chart hues (`--chart-1`..`--chart-8` in globals.css) rather than
 * a color of its own — those are already validated for CVD separation and
 * contrast against this app's dark surfaces, and reusing them means a tile
 * palette never drifts from the chart one.
 */
export const TILE_COLORS: PosCellColor[] = [
  PosCellColor.BLUE,
  PosCellColor.ORANGE,
  PosCellColor.TEAL,
  PosCellColor.AMBER,
  PosCellColor.PINK,
  PosCellColor.GREEN,
  PosCellColor.VIOLET,
  PosCellColor.RED,
];

const CHART_VAR: Record<PosCellColor, string> = {
  BLUE: "--chart-1",
  ORANGE: "--chart-2",
  TEAL: "--chart-3",
  AMBER: "--chart-4",
  PINK: "--chart-5",
  GREEN: "--chart-6",
  VIOLET: "--chart-7",
  RED: "--chart-8",
};

/** The raw hue, full strength — for a swatch button in the picker. */
export function tileSwatchStyle(color: PosCellColor): React.CSSProperties {
  return { backgroundColor: `var(${CHART_VAR[color]})` };
}

/**
 * The tile itself, as drawn on the till and its preview: a tint of the hue
 * mixed into the card's own surface and border, not a flat fill — the label
 * stays `text-[var(--ink)]` at full contrast, and the tile still reads as a
 * card rather than a colored block.
 */
export function tileColorStyle(color: PosCellColor | null): React.CSSProperties | undefined {
  if (!color) {
    return undefined;
  }

  const hue = `var(${CHART_VAR[color]})`;
  return {
    backgroundColor: `color-mix(in srgb, ${hue} 22%, var(--panel-strong))`,
    borderColor: `color-mix(in srgb, ${hue} 45%, var(--line))`,
  };
}
