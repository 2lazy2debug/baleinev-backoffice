import { forwardRef } from "react";
import { cn } from "./cn";

type TableProps = React.TableHTMLAttributes<HTMLTableElement> & {
  /** Bordered, rounded frame around the table. Off when it already sits inside a Panel or Card frame. */
  frame?: boolean;
  /** Denser type for nested tables (invoice line items). */
  dense?: boolean;
  /** Hidden below `sm`, where a <CardletList> renders the same rows as cards. */
  desktopOnly?: boolean;
  /** Layout classes for the frame (margins, height) — `className` styles the table itself. */
  frameClassName?: string;
};

// Cell padding is a table-level decision, not a per-cell one — that is what kept
// three different paddings alive across the app. TH/TD carry no padding of their own.
const densityClasses = {
  default: "text-sm [&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3",
  dense: "text-xs [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2",
};

export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  { frame = true, dense = false, desktopOnly = false, frameClassName, className, children, ...props },
  ref,
) {
  const table = (
    <table
      ref={ref}
      className={cn("w-full text-left", dense ? densityClasses.dense : densityClasses.default, className)}
      {...props}
    >
      {children}
    </table>
  );

  return (
    <div
      className={cn(
        frame ? "overflow-hidden rounded-xl border border-[var(--line)]" : "overflow-auto",
        desktopOnly ? "hidden sm:block" : null,
        frameClassName,
      )}
    >
      {table}
    </div>
  );
});

export function THead({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "bg-[var(--panel-strong)] text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]",
        className,
      )}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TFoot({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot className={cn("border-t-2 border-[var(--line)] bg-[var(--panel-strong)] font-semibold", className)} {...props}>
      {children}
    </tfoot>
  );
}

export function TR({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-t border-[var(--line)] first:border-t-0", className)} {...props}>
      {children}
    </tr>
  );
}

export function TH({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("font-medium", className)} {...props}>
      {children}
    </th>
  );
}

export function TD({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={className} {...props}>
      {children}
    </td>
  );
}
