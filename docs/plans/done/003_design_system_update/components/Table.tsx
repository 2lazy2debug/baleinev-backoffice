import { cn } from "./cn";

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)]">
      <table className={cn("w-full text-left text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

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
    <th className={cn("px-4 py-3 font-medium", className)} {...props}>
      {children}
    </th>
  );
}

export function TD({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-3", className)} {...props}>
      {children}
    </td>
  );
}
