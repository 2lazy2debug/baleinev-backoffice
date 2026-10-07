"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, Pencil } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import {
  Button,
  Cardlet,
  CardletActions,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  ConfirmDelete,
  Field,
  IconButton,
  Input,
  Modal,
  Panel,
  PanelHeader,
  SectionTitle,
  TD,
  TH,
  THead,
  TR,
  Table,
  iconButtonClasses,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { deletePosTemplateAction, renamePosTemplateAction } from "../actions";

export type PosTemplateRow = {
  id: string;
  name: string;
  tileCount: number;
};

const RENAME_FORM_ID = "rename-pos-template";

export function PosTemplatesClient({ locale, templates }: { locale: Locale; templates: PosTemplateRow[] }) {
  const copy = dictionaries[locale].pos;
  const shell = dictionaries[locale].shell;
  const router = useRouter();
  const isReadOnly = useEditionReadOnly();

  const [renaming, setRenaming] = useState<PosTemplateRow | null>(null);
  const [renameState, renameAction, renamePending] = useActionState(renamePosTemplateAction, initialActionState);
  const markRenamed = useCloseOnSuccess(renameState, renamePending, () => {
    setRenaming(null);
    router.refresh();
  });

  const [deleteState, deleteAction, deleting] = useActionState(deletePosTemplateAction, initialActionState);

  function rowActions(template: PosTemplateRow, inCard?: boolean) {
    const formId = `delete-template-${inCard ? "card-" : ""}${template.id}`;

    return (
      <div className="flex items-center justify-end gap-2">
        <Link
          href={`/pos/templates/${template.id}`}
          aria-label={copy.editGrid}
          title={copy.editGrid}
          className={iconButtonClasses("accent", "sm")}
        >
          <LayoutGrid />
        </Link>
        {isReadOnly ? null : (
          <>
            <IconButton tone="neutral" size="sm" label={copy.renameTemplate} onClick={() => setRenaming(template)}>
              <Pencil />
            </IconButton>
            <form id={formId} action={deleteAction}>
              <input type="hidden" name="templateId" value={template.id} />
            </form>
            <ConfirmDelete
              form={formId}
              label={copy.deleteTemplate}
              subject={template.name}
              message={copy.deleteTemplateConfirm}
              cancelLabel={shell.cancel}
              disabled={deleting}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <Panel flushOnMobile>
        <PanelHeader flushOnMobile>
          <SectionTitle desktopOnly>{copy.templatesTitle}</SectionTitle>
        </PanelHeader>

        {deleteState.error ? (
          <div className="border-b border-[var(--line)] px-3 py-2 sm:px-5">
            <FormError message={deleteState.error} />
          </div>
        ) : null}

        <Table desktopOnly dense frame={false}>
          <THead>
            <TR>
              <TH>{copy.templateName}</TH>
              <TH>{copy.tiles}</TH>
              <TH aria-label={copy.editGrid} />
            </TR>
          </THead>
          <tbody>
            {templates.map((template) => (
              <TR key={template.id}>
                <TD className="font-medium">
                  <Link href={`/pos/templates/${template.id}`} className="hover:text-[var(--accent)]">
                    {template.name}
                  </Link>
                </TD>
                <TD className="tabular-nums">{template.tileCount}</TD>
                <TD>{rowActions(template)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>

        <CardletList>
          {templates.map((template) => (
            <Cardlet key={template.id}>
              <CardletHeader
                title={
                  <Link href={`/pos/templates/${template.id}`} className="hover:text-[var(--accent)]">
                    {template.name}
                  </Link>
                }
              />
              <CardletFields>
                <CardletField label={copy.tiles}>{template.tileCount}</CardletField>
              </CardletFields>
              <CardletActions inline>{rowActions(template, true)}</CardletActions>
            </Cardlet>
          ))}
        </CardletList>
      </Panel>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={copy.renameTemplate}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setRenaming(null)}>
              {shell.cancel}
            </Button>
            <Button type="submit" form={RENAME_FORM_ID} variant="primary" disabled={renamePending}>
              {shell.save}
            </Button>
          </>
        }
      >
        {renaming ? (
          <form id={RENAME_FORM_ID} action={renameAction} onSubmit={markRenamed} className="space-y-4">
            <FormError message={renameState.error} />
            <input type="hidden" name="templateId" value={renaming.id} />
            <Field required label={copy.templateName}>
              <Input type="text" name="name" defaultValue={renaming.name} required autoFocus />
            </Field>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
