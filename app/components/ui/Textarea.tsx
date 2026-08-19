import { forwardRef } from "react";
import { cn } from "./cn";
import { autoHeightFieldClasses } from "./Input";

// Same recipe as Input, minus the fixed height — a textarea grows with its `rows`.
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(autoHeightFieldClasses, className)} {...props} />;
  },
);
