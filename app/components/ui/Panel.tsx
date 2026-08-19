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
};

/**
 * A framed region whose content sits flush against the border — tables, lists,
 * grouped rows. Where <Card> is a padded surface, <Panel> is the frame around
 * content that brings its own padding.
 */
export function Panel({ as: As = "section", nested = false, className, children, ...props }: PanelProps) {
  return (
    <As
      className={cn(
        "overflow-hidden",
        nested ? nestedSurfaceClasses : "rounded-2xl border border-[var(--line)]",
        className,
      )}
      {...props}
    >
      {children}
    </As>
  );
}

/** The header strip of a Panel — one background, one padding, everywhere. */
export function PanelHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--panel-strong)] px-5 py-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Section title inside a PanelHeader — same weight/size as a Card heading. */
export function PanelTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-lg font-semibold", className)} {...props}>
      {children}
    </h2>
  );
}
