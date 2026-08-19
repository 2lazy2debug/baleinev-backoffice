/**
 * The single control scale.
 *
 * Every interactive control — Button, IconButton, Input, Select — resolves its
 * height from here, so a field, a button and an icon action sitting in the same
 * row always line up. Two sizes only: `md` for page/section forms, `sm` for
 * dense inline contexts (table rows, toolbars).
 */
export type ControlSize = "md" | "sm";

export const controlHeight: Record<ControlSize, string> = {
  md: "h-10",
  sm: "h-8",
};

/** Square footprint for icon-only controls — same heights, matching width. */
export const controlSquare: Record<ControlSize, string> = {
  md: "h-10 w-10",
  sm: "h-8 w-8",
};
