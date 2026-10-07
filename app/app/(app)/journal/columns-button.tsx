"use client";

import { useState } from "react";
import { Columns3 } from "lucide-react";

import { journalColumnLabel, useJournalColumns } from "@/components/journal-columns";
import { Button, Checkbox, Modal } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { DEFAULT_JOURNAL_COLUMNS, JOURNAL_COLUMNS } from "@/lib/journal-grid";

/**
 * Picks which columns the journal table draws. Sits left of the create button
 * in `<PageHeader actions>`; toggles apply at once and are remembered by this
 * browser, so the dialog has nothing to submit.
 */
export function JournalColumnsButton({ locale }: { locale: Locale }) {
  const [isOpen, setIsOpen] = useState(false);
  const { columns, chooseColumns } = useJournalColumns();
  const copy = dictionaries[locale].journal;
  const shown = new Set(columns);

  function toggle(column: (typeof JOURNAL_COLUMNS)[number], checked: boolean) {
    chooseColumns(checked ? [...columns, column] : columns.filter((c) => c !== column));
  }

  return (
    <>
      <Button icon={<Columns3 />} compactOnMobile onClick={() => setIsOpen(true)}>
        {copy.columns}
      </Button>
      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={copy.columnsTitle}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => chooseColumns([...DEFAULT_JOURNAL_COLUMNS])}>
              {copy.resetColumns}
            </Button>
            <Button type="button" variant="primary" onClick={() => setIsOpen(false)}>
              {copy.close}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {JOURNAL_COLUMNS.map((column) => (
            <Checkbox
              key={column}
              id={`journal-column-${column}`}
              label={journalColumnLabel(column, locale)}
              checked={shown.has(column)}
              onChange={(e) => toggle(column, e.target.checked)}
            />
          ))}
        </div>
      </Modal>
    </>
  );
}
