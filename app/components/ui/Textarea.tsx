import { forwardRef } from "react";
import { cn } from "./cn";
import { autoHeightFieldClasses } from "./Input";
import { type ControlSize } from "./control";

type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> & { size?: ControlSize };

// Same recipe as Input, minus the fixed height — a textarea grows with its `rows`.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, rows = 3, size = "md", ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(autoHeightFieldClasses, size === "sm" ? "text-xs" : "text-sm", className)}
        {...props}
      />
    );
  },
);
