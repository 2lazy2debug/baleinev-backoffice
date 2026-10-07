import { FileSpreadsheet } from "lucide-react";

import { buttonClasses, compactOnMobileWidths } from "@/components/ui";

/**
 * Downloads the active edition's controlling workbook (summary + journal). A
 * plain link to the route: the browser handles the file, nothing to hold in state.
 */
export function ControllingExportButton({ label }: { label: string }) {
  return (
    <a
      href="/api/journal/controlling-export"
      download
      title={label}
      aria-label={label}
      className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
    >
      <FileSpreadsheet />
      <span className="hidden lg:inline">{label}</span>
    </a>
  );
}
