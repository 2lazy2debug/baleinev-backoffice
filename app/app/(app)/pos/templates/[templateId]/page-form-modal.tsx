"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { addPosTemplatePageAction, renamePosTemplatePageAction } from "../../actions";

const FORM_ID = "pos-page-form";

/**
 * Adds a page, or renames one — the same dialog for both, like the tile's. A
 * page is a title and nothing else: a new one goes after the last, and is
 * moved from the editor's page headers.
 */
export function PageFormModal({
  locale,
  templateId,
  open,
  page,
  onClose,
}: {
  locale: Locale;
  templateId: string;
  open: boolean;
  /** The page being renamed, or null to add one after the last. */
  page: { id: string; title: string | null } | null;
  onClose: () => void;
}) {
  const copy = dictionaries[locale].pos;
  const shell = dictionaries[locale].shell;
  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    page ? renamePosTemplatePageAction : addPosTemplatePageAction,
    initialActionState,
  );
  const markSubmitted = useCloseOnSuccess(state, pending, () => {
    onClose();
    router.refresh();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={page ? copy.editPage : copy.addPage}
      size="sm"
      mobileFullScreen
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {shell.cancel}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={pending}>
            {shell.save}
          </Button>
        </>
      }
    >
      {open ? (
        <form
          key={page?.id ?? "new"}
          id={FORM_ID}
          action={formAction}
          onSubmit={markSubmitted}
          className="space-y-4"
        >
          <FormError message={state.error} />
          <input type="hidden" name="templateId" value={templateId} />
          {page ? <input type="hidden" name="pageId" value={page.id} /> : null}
          <Field label={copy.pageTitle}>
            <Input type="text" name="title" defaultValue={page?.title ?? ""} autoFocus />
          </Field>
          <p className="text-xs text-[var(--muted)]">{copy.pageTitleHint}</p>
        </form>
      ) : null}
    </Modal>
  );
}
