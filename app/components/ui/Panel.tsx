import { cn } from "./cn";

/**
 * Frame for a surface nested inside a Card, Panel or Modal — one step lighter
 * than the page-level frame. Exported as classes because the elements that need
 * it are semantic and varied (form, details, div).
 */
export const nestedSurfaceClasses = "rounded-xl border border-[var(--line)] bg-[var(--panel)]";

type PanelProps = React.HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article" | "ul";
  /** Nested inside another surface — lighter frame, no page-level rounding. */
  nested?: boolean;
  /**
   * Below `sm` the frame collapses — no border, no rounding, no background —
   * the same rule as `<Card flushOnMobile>`. For a panel whose mobile content is
   * a <CardletList>: each cardlet is already a surface, so the frame around them
   * is a second border and 24px of width that buy nothing on a 390px screen.
   */
  flushOnMobile?: boolean;
};

/**
 * A framed region whose content sits flush against the border — tables, lists,
 * grouped rows. Where <Card> is a padded surface, <Panel> is the frame around
 * content that brings its own padding.
 */
export function Panel({
  as: As = "section",
  nested = false,
  flushOnMobile = false,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <As
      className={cn(
        "overflow-hidden",
        nested ? nestedSurfaceClasses : "rounded-2xl border border-[var(--line)]",
        flushOnMobile ? "max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent" : null,
        className,
      )}
      {...props}
    >
      {children}
    </As>
  );
}

type PanelHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Matches `<Panel flushOnMobile>` — the strip loses its rule, fill and gutter below `sm`. */
  flushOnMobile?: boolean;
};

/** The header strip of a Panel — one background, one padding, everywhere. */
export function PanelHeader({ flushOnMobile = false, className, children, ...props }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--panel-strong)]",
        "px-3 py-2.5 sm:px-5 sm:py-4",
        flushOnMobile ? "max-sm:border-0 max-sm:bg-transparent max-sm:px-0 max-sm:pb-2 max-sm:pt-0" : null,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type SectionTitleProps = React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h2" | "h3";
  /**
   * Hidden below `sm` — same meaning as <Table desktopOnly>. For a heading the
   * mobile layout already states somewhere else (a <SegmentedControl> segment,
   * the page title), so a phone is not shown the same word twice.
   */
  desktopOnly?: boolean;
};

/** The heading of a section — a Card, a Panel header, a grouped list. One size app-wide. */
export function SectionTitle({ as: As = "h2", desktopOnly = false, className, children, ...props }: SectionTitleProps) {
  return (
    <As className={cn("text-lg font-semibold", desktopOnly ? "hidden sm:block" : null, className)} {...props}>
      {children}
    </As>
  );
}
