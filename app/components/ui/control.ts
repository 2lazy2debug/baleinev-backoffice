/**
 * The single control scale.
 *
 * Every interactive control — Button, IconButton, Input, Select — resolves its
 * height from here, so a field, a button and an icon action sitting in the same
 * row always line up. Two sizes only: `md` for page/section forms, `sm` for
 * dense inline contexts (table rows, toolbars).
 *
 * The scale is responsive. Below `lg` — the same breakpoint where the sidebar
 * becomes the mobile bottom bar — every control is `h-11` (44px), the minimum
 * comfortable touch target; the dense desktop heights come back at `lg`. That
 * floor lives here so no screen ever has to hand-size a control for mobile.
 */
export type ControlSize = "md" | "sm";

export const controlHeight: Record<ControlSize, string> = {
  md: "h-11 lg:h-10",
  sm: "h-11 lg:h-8",
};

/** Square footprint for icon-only controls — same heights, matching width. */
export const controlSquare: Record<ControlSize, string> = {
  md: "h-11 w-11 lg:h-10 lg:w-10",
  sm: "h-11 w-11 lg:h-8 lg:w-8",
};
