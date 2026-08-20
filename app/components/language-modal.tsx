"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Modal, Radio } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

/**
 * The language switch, as its own dialog.
 *
 * Both shells open this one component — the sidebar's globe button on desktop,
 * the bottom bar's on a phone — so the app has one language switch, not one per
 * surface. The locale lives in a cookie, so saving is a POST plus a refresh.
 *
 * Mount it only while it is open (`{isOpen ? <LanguageModal … /> : null}`): the
 * pending choice is local state, and a cancelled pick must not survive to the
 * next open.
 */
export function LanguageModal({ onClose, locale }: { onClose: () => void; locale: Locale }) {
  const router = useRouter();
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const copy = dictionaries[locale].shell;

  async function save() {
    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetch("/api/preferences/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: selectedLocale }),
      });
      if (!response.ok) {
        setSaveError(true);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.language}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="button" variant="primary" onClick={save} disabled={saving}>
            {saving ? "..." : copy.save}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Radio
          id="language-en"
          name="language"
          value="en"
          label={copy.english}
          checked={selectedLocale === "en"}
          onChange={() => setSelectedLocale("en")}
        />
        <Radio
          id="language-fr"
          name="language"
          value="fr"
          label={copy.french}
          checked={selectedLocale === "fr"}
          onChange={() => setSelectedLocale("fr")}
        />
      </div>

      {saveError ? <Alert className="mt-4">{copy.saveFailed}</Alert> : null}
    </Modal>
  );
}
