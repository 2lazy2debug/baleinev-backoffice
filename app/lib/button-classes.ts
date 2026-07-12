/**
 * Consistent button styling utilities for icon and text buttons.
 * Ensures uniform appearance across all components.
 */

export const buttonClasses = {
  // Icon buttons (p-2 for reasonable touch targets)
  icon: {
    // Edit: green/accent color
    edit: "rounded-md border border-[var(--line)] p-2 text-[var(--accent)] hover:bg-[var(--panel-strong)]",

    // Delete: rose/red color
    delete: "rounded-md border border-[var(--line)] p-2 text-rose-300 hover:bg-rose-950/40",

    // Save/confirm: emerald/green color
    save: "rounded-md border border-emerald-400 p-1.5 text-emerald-400 hover:bg-emerald-950/40 disabled:opacity-50",

    // Cancel/close: neutral
    cancel: "rounded-md border border-[var(--line)] p-1.5 text-[var(--muted)] hover:bg-[var(--panel-strong)]",

    // Generic action (plus, etc): neutral
    action: "rounded-md border border-[var(--line)] p-2 text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)]",
  },

  // Text buttons with padding
  text: {
    // Edit with text
    edit: "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--panel-strong)] disabled:opacity-50",

    // Delete with text
    delete: "rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-950/40 disabled:opacity-50",

    // Save with text
    save: "rounded-md border border-emerald-400 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-950/40 disabled:opacity-50",

    // Cancel with text
    cancel: "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--panel-strong)]",

    // Primary button (filled background)
    primary: "rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60",
  },

  // Full-sized primary buttons
  primary:
    "rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60",
} as const;
