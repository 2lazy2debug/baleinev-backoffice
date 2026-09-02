import { cn } from "./cn";

type CardSpan = "1/4" | "1/3" | "1/2" | "2/3" | "full";

// Working area = body minus sidebar. Cards sit in a 12-col grid; span picks the fraction.
const spanClasses: Record<CardSpan, string> = {
  "1/4": "col-span-12 sm:col-span-6 lg:col-span-3",
  "1/3": "col-span-12 sm:col-span-6 lg:col-span-4",
  "1/2": "col-span-12 lg:col-span-6",
  "2/3": "col-span-12 lg:col-span-8",
  full: "col-span-12",
};

type CardProps = React.HTMLAttributes<HTMLElement> & {
  span?: CardSpan;
  /** Empty-state treatment: dashed border, no strong background. */
  dashed?: boolean;
  /**
   * Below `sm` the frame collapses — no border, no background, no padding.
   * For a section whose mobile content is a <CardletList>: a cardlet is already
   * a surface, and a card of cards reads as noise inside a 390px viewport.
   */
  flushOnMobile?: boolean;
  as?: "article" | "section" | "div";
};

export function Card({
  span = "full",
  dashed = false,
  flushOnMobile = false,
  as: As = "article",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <As
      className={cn(
        // A phone spends 5% of its width on each side of a p-5 card. p-3 below
        // `sm` is the same surface with the air a 390px viewport can afford.
        "rounded-2xl border p-3 sm:p-5",
        dashed
          ? "border-dashed border-[var(--line)] bg-[var(--panel-strong)] text-sm text-[var(--muted)]"
          : "border-[var(--line)] bg-[var(--panel-strong)]",
        flushOnMobile ? "max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0" : null,
        spanClasses[span],
        className,
      )}
      {...props}
    >
      {children}
    </As>
  );
}

/**
 * The 12-column track that `<Card span>` slices.
 *
 * **Cards in one row are the height of the tallest one.** `items-stretch` is the
 * grid default, but it is spelled out because it is a rule rather than an
 * accident: a row of cards has to read as one band, and ragged bottoms make a
 * screen look broken. Never opt a screen out with `items-start` — if a card is
 * mostly empty next to a tall neighbour, the fix is its content or its `span`.
 *
 * The rule costs nothing on a phone: below `sm` every span is `col-span-12`, so
 * a row holds one card and there is nothing to equalise.
 */
export function CardGrid({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("grid grid-cols-12 items-stretch gap-4", className)} {...props}>
      {children}
    </div>
  );
}
