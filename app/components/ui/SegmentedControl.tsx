import { Button } from "./Button";
import { cn } from "./cn";
import type { ControlSize } from "./control";

type SegmentedControlOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

type SegmentedControlProps<T extends string> = {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: ControlSize;
  className?: string;
};

/**
 * One row of mutually exclusive choices — the toggle a screen uses when it has
 * to show one of two panels instead of both (Expense Reports' History / New
 * report below `lg`).
 *
 * It is a strip of <Button>s, so the heights come from the control scale and a
 * segment is a 44px touch target on a phone for free. Pure view state: the
 * caller owns `value`, and nothing here touches the URL or server state.
 *
 * Pair it with <PageHeader controls> so the toggle rides in the sticky top bar
 * rather than scrolling away with the content it switches.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div role="group" className={cn("flex gap-1 rounded-lg bg-[var(--panel-strong)] p-1", className)}>
      {options.map((option) => (
        <Button
          key={option.value}
          variant={option.value === value ? "primary" : "ghost"}
          size={size}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className="grow basis-0"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
