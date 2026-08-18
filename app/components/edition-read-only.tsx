"use client";

import { Lock } from "lucide-react";
import { createContext, useContext } from "react";

import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

/**
 * True when the edition the user is working in is closed. Closed means
 * read-only: pages, exports and PDFs still work, but every write is refused by
 * `requireWritableEdition` on the server. This context is the courtesy half —
 * it lets each page hide the create/edit/delete affordances instead of letting
 * a click fail. Hiding buttons is never the control; the server guard is.
 */
const EditionReadOnlyContext = createContext(false);

export function EditionReadOnlyProvider({
  isReadOnly,
  children,
}: {
  isReadOnly: boolean;
  children: React.ReactNode;
}) {
  return <EditionReadOnlyContext.Provider value={isReadOnly}>{children}</EditionReadOnlyContext.Provider>;
}

export function useEditionReadOnly() {
  return useContext(EditionReadOnlyContext);
}

/**
 * Renders its children only while the selected edition is writable. Lets a
 * server page drop a create panel without becoming a client component itself.
 */
export function WritableEditionOnly({ children }: { children: React.ReactNode }) {
  return useEditionReadOnly() ? null : <>{children}</>;
}

export function EditionClosedBanner({ locale, editionName }: { locale: Locale; editionName: string }) {
  const copy = dictionaries[locale].common;

  return (
    <div className="mb-5 flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" />
      <p className="text-sm text-[var(--muted)]">
        <span className="font-medium text-[var(--ink)]">{editionName} {copy.editionClosedTitle}</span>{" "}
        {copy.editionClosedHint}
      </p>
    </div>
  );
}
