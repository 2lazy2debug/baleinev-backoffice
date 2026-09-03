import { cn } from "./cn";

/**
 * The mobile stand-in for a wide table row.
 *
 * A table with more than ~4 columns is unreadable on a phone, so every such
 * screen renders the *same* array twice: `<Table desktopOnly>` above `sm`, and a
 * `<CardletList>` below it. The two views must always be fed by one array and one
 * set of computed values — never a second query, never a second status mapping.
 *
 *   <Table desktopOnly>…</Table>
 *   <CardletList>
 *     {rows.map((row) => (
 *       <Cardlet key={row.id}>
 *         <CardletHeader title={row.label} action={<Badge tone={tone}>{status}</Badge>} />
 *         <CardletFields>
 *           <CardletField label="Date">{date}</CardletField>
 *           …
 *         </CardletFields>
 *         <CardletActions>…</CardletActions>
 *       </Cardlet>
 *     ))}
 *   </CardletList>
 */
export function CardletList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-2 sm:hidden", className)} {...props}>
      {children}
    </div>
  );
}

/** One row of the table, as a card. Same surface as <Card>, tighter padding. */
export function Cardlet({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-2.5",
        className,
      )}
      {...props}
    >
      {children}
    </article>
  );
}

// `title` is intentionally not the HTML attribute here — a cardlet header can carry a
// stacked identity (a reference line above a label), so it takes a node, not a string.
type CardletHeaderProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  /** The row's identity — the column you would scan the table by. */
  title: React.ReactNode;
  /** Trailing element, typically a status <Badge> or an amount. */
  action?: React.ReactNode;
};

export function CardletHeader({ title, action, className, children, ...props }: CardletHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-2", className)} {...props}>
      <div className="min-w-0 flex-1 text-sm font-medium">{title}</div>
      {action}
      {children}
    </div>
  );
}

/** The remaining columns, two per line — the densest that stays readable at 360px. */
export function CardletFields({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-2 text-xs", className)} {...props}>
      {children}
    </div>
  );
}

type CardletFieldProps = React.HTMLAttributes<HTMLDivElement> & { label: React.ReactNode };

/** One column header + cell, stacked. Pass `className="col-span-2"` for a full-width one. */
export function CardletField({ label, className, children, ...props }: CardletFieldProps) {
  return (
    <div className={cn("min-w-0", className)} {...props}>
      <p className="text-3xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <div className="truncate">{children}</div>
    </div>
  );
}

type CardletActionsProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * A trailing row of icon-only actions instead of the full-width stack. Two
   * <IconButton>s are already a 44px target each, and stacking them turns a
   * list of twenty rows into a page of buttons — a phone reads such a list to
   * find one row, not to act on every one.
   */
  inline?: boolean;
};

/** Row actions, stacked full-width — a phone has no room for a trailing actions column. */
export function CardletActions({ inline = false, className, children, ...props }: CardletActionsProps) {
  return (
    <div
      className={cn(
        inline ? "flex items-center justify-end gap-2" : "flex flex-col gap-2 [&>*]:w-full [&_button]:w-full",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
