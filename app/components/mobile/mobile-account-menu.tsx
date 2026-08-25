"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { CircleUserRound, Globe, Layers } from "lucide-react";

import { MobileSheet, MobileSheetRow } from "@/components/mobile/mobile-sheet";
import { useMobileShell } from "@/components/mobile/mobile-shell-context";
import { SignOutButton } from "@/components/sign-out-button";
// Leaf imports rather than the `@/components/ui` barrel: <PageHeader> renders
// this component, and the barrel re-exports PageHeader.
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { dictionaries } from "@/lib/i18n-dictionaries";

/** "2025–2026" → "25–26", "Edition 2025" → "2025". The row has room for ~8 characters. */
export function shortEditionLabel(name: string) {
  const years = name.match(/\d{4}/g);
  if (years && years.length >= 2) {
    return `${years[0].slice(2)}–${years[1].slice(2)}`;
  }
  if (years) {
    return years[0];
  }
  return name;
}

/** Only ever one overlay at a time, the same rule the app drawer follows. */
type Overlay = "closed" | "menu" | "edition";

/**
 * The account control on a phone: an icon at the top right of the screen's own
 * top bar, level with the screen's name, opening everything that is *about the
 * person* rather than about an app — account, language, edition, sign out.
 *
 * It lives in <PageHeader> because that is the mobile top bar; the bottom bar
 * below is apps only. Above `lg` there is a sidebar carrying all four, so this
 * renders nothing.
 */
export function MobileAccountMenu() {
  const shell = useMobileShell();
  const pathname = usePathname();
  const [overlay, setOverlay] = useState<Overlay>("closed");

  if (!shell) {
    return null;
  }

  const {
    userName,
    editions,
    selectedEditionId,
    switchingEdition,
    onSelectEdition,
    onOpenLanguage,
    locale,
  } = shell;
  const copy = dictionaries[locale].shell;

  const selectedEdition = editions.find((edition) => edition.id === selectedEditionId) ?? null;

  return (
    <>
      <IconButton
        size="md"
        tone="neutral"
        label={copy.account}
        className="lg:hidden"
        aria-expanded={overlay === "menu"}
        onClick={() => setOverlay("menu")}
      >
        <CircleUserRound />
      </IconButton>

      <MobileSheet open={overlay === "menu"} onClose={() => setOverlay("closed")}>
        <p className="mb-1 truncate text-sm font-semibold">{userName}</p>
        <MobileSheetRow
          icon={CircleUserRound}
          label={copy.account}
          href="/account"
          active={pathname === "/account" || pathname.startsWith("/account/")}
          onClick={() => setOverlay("closed")}
        />
        <MobileSheetRow
          icon={Globe}
          label={copy.language}
          value={locale === "fr" ? copy.french : copy.english}
          onClick={() => {
            setOverlay("closed");
            onOpenLanguage();
          }}
        />
        <MobileSheetRow
          icon={Layers}
          label={copy.edition}
          value={selectedEdition ? shortEditionLabel(selectedEdition.name) : copy.pickEdition}
          onClick={() => setOverlay("edition")}
        />
        <SignOutButton row label={copy.signOut} />
      </MobileSheet>

      {/* The sidebar's edition <Select>, relocated — same options, same handler. */}
      <Modal
        open={overlay === "edition"}
        onClose={() => setOverlay("closed")}
        title={copy.switchEdition}
        size="sm"
      >
        {editions.length > 0 ? (
          <Select
            aria-label={copy.edition}
            value={selectedEditionId ?? ""}
            disabled={switchingEdition}
            onChange={(event) => {
              onSelectEdition(event.target.value);
              setOverlay("closed");
            }}
          >
            {selectedEditionId ? null : <option value="">{copy.pickEdition}</option>}
            {editions.map((edition) => (
              <option key={edition.id} value={edition.id}>
                {edition.isClosed ? `${edition.name} — ${copy.editionClosed}` : edition.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-[var(--muted)]">{copy.noEditions}</p>
        )}
      </Modal>
    </>
  );
}
