"use client";

import { createContext, useContext } from "react";

import type { EditionOption } from "@/components/navigation";
import type { Locale } from "@/lib/i18n-dictionaries";

/**
 * What the mobile account menu needs from <AppShell>.
 *
 * The menu is rendered by <PageHeader>, which every screen owns, so it cannot be
 * handed these as props without every page threading them through. It reads them
 * from here instead — and `onSelectEdition` / `onOpenLanguage` stay AppShell's own
 * handlers, so the app still has one edition switch and one language dialog.
 */
export type MobileShellValue = {
  userName: string;
  editions: EditionOption[];
  selectedEditionId: string | null;
  switchingEdition: boolean;
  onSelectEdition: (editionId: string) => void;
  onOpenLanguage: () => void;
  locale: Locale;
};

const MobileShellContext = createContext<MobileShellValue | null>(null);

export function MobileShellProvider({
  value,
  children,
}: {
  value: MobileShellValue;
  children: React.ReactNode;
}) {
  return <MobileShellContext.Provider value={value}>{children}</MobileShellContext.Provider>;
}

/**
 * Null outside the app shell — the error and not-found screens render a
 * <PageHeader> with no shell around it, and there is no account to open there.
 */
export function useMobileShell() {
  return useContext(MobileShellContext);
}
