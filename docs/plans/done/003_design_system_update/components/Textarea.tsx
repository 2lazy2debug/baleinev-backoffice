import { forwardRef } from "react";
import { cn } from "./cn";
import { inputClasses } from "./Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(inputClasses("md"), className)} {...props} />;
  },
);
