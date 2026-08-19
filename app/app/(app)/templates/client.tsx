"use client";

import { useActionState } from "react";
import { DocumentType } from "@prisma/client";
import { Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
import { Badge, Button, Card, CardGrid, Field, IconButton, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import type { getDictionary } from "@/lib/i18n";
import { initialActionState } from "@/lib/server-action-helpers";

import {
  createDocumentTemplateAction,
  deleteDocumentTemplateAction,
  makeDocumentTemplateDefaultAction,
  updateDocumentTemplateAction,
} from "./actions";

type TemplateItem = {
  id: string;
  name: string;
  documentType: DocumentType;
  html: string;
  isDefault: boolean;
};

type Dictionary = ReturnType<typeof getDictionary>;

export function TemplatesPageClient({
  templates,
  placeholders,
  copy,
}: {
  templates: TemplateItem[];
  placeholders: string[];
  copy: Dictionary;
}) {
  const [updateState, updateFormAction, isUpdating] = useActionState(updateDocumentTemplateAction, initialActionState);
  const [makeDefaultState, makeDefaultFormAction, isMakingDefault] = useActionState(
    makeDocumentTemplateDefaultAction,
    initialActionState
  );
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteDocumentTemplateAction, initialActionState);
  const [createState, createFormAction, isCreating] = useActionState(createDocumentTemplateAction, initialActionState);

  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-4">
        <FormError message={updateState.error} />
        <FormError message={makeDefaultState.error} />
        <FormError message={deleteState.error} />
        {templates.length === 0 ? (
          <Card span="full" dashed>
            {copy.templates.noTemplates}
          </Card>
        ) : (
          <CardGrid>
            {templates.map((template) => (
              <Card key={template.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                      <span>{template.documentType === DocumentType.INVOICE ? copy.templates.invoiceType : template.documentType}</span>
                      <span>•</span>
                      <span>{copy.templates.pdfFormat}</span>
                      {template.isDefault ? <Badge tone="success">{copy.templates.defaultLabel}</Badge> : null}
                    </div>

                    <form action={updateFormAction} className="space-y-3">
                      <input type="hidden" name="templateId" value={template.id} />
                      <Field label={copy.templates.name}>
                        <Input type="text" name="name" defaultValue={template.name} required />
                      </Field>
                      <Field label={copy.templates.html}>
                        <Textarea
                          name="html"
                          defaultValue={template.html}
                          required
                          rows={26}
                          size="sm"
                          className="min-h-[420px] font-mono"
                        />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" variant="secondary" disabled={isUpdating}>
                          {copy.templates.save}
                        </Button>
                      </div>
                    </form>
                  </div>

                  <div className="flex flex-col gap-2">
                    {!template.isDefault ? (
                      <form action={makeDefaultFormAction}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <Button type="submit" variant="secondary" disabled={isMakingDefault}>
                          {copy.templates.makeDefault}
                        </Button>
                      </form>
                    ) : null}
                    <form action={deleteFormAction}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <IconButton
                        type="submit"
                        size="md"
                        tone="delete"
                        label={template.isDefault ? copy.templates.cannotDeleteDefault : copy.templates.deleteButton}
                        disabled={template.isDefault || isDeleting}
                      >
                        <Trash2 />
                      </IconButton>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </CardGrid>
        )}
      </div>

      <section className="space-y-6">
        <Card as="section">
          <SectionTitle>{copy.templates.create}</SectionTitle>
          <form action={createFormAction} className="mt-6 space-y-4">
            <FormError message={createState.error} />
            <Field label={copy.templates.name}>
              <Input type="text" name="name" required />
            </Field>

            <Field label={copy.templates.documentType}>
              <Select name="documentType" defaultValue={DocumentType.INVOICE}>
                <option value={DocumentType.INVOICE}>{copy.templates.invoiceType}</option>
              </Select>
            </Field>

            <Field label={copy.templates.outputFormat}>
              <Input type="text" value={copy.templates.pdfFormat} disabled className="text-[var(--muted)]" />
            </Field>

            <Field label={copy.templates.html}>
              <Textarea
                name="html"
                defaultValue={templates.find((template) => template.isDefault && template.documentType === DocumentType.INVOICE)?.html ?? ""}
                required
                rows={18}
                size="sm"
                className="min-h-[320px] font-mono"
              />
            </Field>

            <Button type="submit" variant="primary" disabled={isCreating}>
              {copy.templates.createButton}
            </Button>
          </form>
        </Card>

        <Card as="section">
          <SectionTitle>{copy.templates.placeholders}</SectionTitle>
          <ul className="mt-4 space-y-2 font-mono text-xs text-[var(--muted)]">
            {placeholders.map((placeholder) => (
              <li key={placeholder}>{placeholder}</li>
            ))}
          </ul>
        </Card>
      </section>
    </section>
  );
}
