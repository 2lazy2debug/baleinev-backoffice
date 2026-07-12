"use client";

import { useActionState } from "react";
import { DocumentType } from "@prisma/client";
import { Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
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
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)]">
            {copy.templates.noTemplates}
          </div>
        ) : (
          templates.map((template) => (
            <article key={template.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    <span>{template.documentType === DocumentType.INVOICE ? copy.templates.invoiceType : template.documentType}</span>
                    <span>•</span>
                    <span>{copy.templates.pdfFormat}</span>
                    {template.isDefault ? (
                      <span className="rounded-full bg-[var(--panel)] px-2 py-1 text-[10px] font-semibold text-[var(--ink)]">
                        {copy.templates.defaultLabel}
                      </span>
                    ) : null}
                  </div>

                  <form action={updateFormAction} className="space-y-3">
                    <input type="hidden" name="templateId" value={template.id} />
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--muted)]">{copy.templates.name}</span>
                      <input
                        type="text"
                        name="name"
                        defaultValue={template.name}
                        required
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--muted)]">{copy.templates.html}</span>
                      <textarea
                        name="html"
                        defaultValue={template.html}
                        required
                        rows={26}
                        className="min-h-[420px] w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 font-mono text-xs outline-none transition focus:border-[var(--accent)]"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={isUpdating}
                        className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[var(--panel)] disabled:opacity-60"
                      >
                        {copy.templates.save}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="flex flex-col gap-2">
                  {!template.isDefault ? (
                    <form action={makeDefaultFormAction}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <button
                        disabled={isMakingDefault}
                        className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[var(--panel)] disabled:opacity-60"
                      >
                        {copy.templates.makeDefault}
                      </button>
                    </form>
                  ) : null}
                  <form action={deleteFormAction}>
                    <input type="hidden" name="templateId" value={template.id} />
                    <button
                      disabled={template.isDefault || isDeleting}
                      title={template.isDefault ? copy.templates.cannotDeleteDefault : copy.templates.deleteButton}
                      className="rounded-md border border-rose-300 p-2 text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)] disabled:hover:bg-transparent"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <section className="space-y-6">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
          <h2 className="text-xl font-semibold">{copy.templates.create}</h2>
          <form action={createFormAction} className="mt-6 space-y-4">
            <FormError message={createState.error} />
            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.templates.name}</span>
              <input
                type="text"
                name="name"
                required
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.templates.documentType}</span>
              <select
                name="documentType"
                defaultValue={DocumentType.INVOICE}
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              >
                <option value={DocumentType.INVOICE}>{copy.templates.invoiceType}</option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.templates.outputFormat}</span>
              <input
                type="text"
                value={copy.templates.pdfFormat}
                disabled
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-[var(--muted)] outline-none"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.templates.html}</span>
              <textarea
                name="html"
                defaultValue={templates.find((template) => template.isDefault && template.documentType === DocumentType.INVOICE)?.html ?? ""}
                required
                rows={18}
                className="min-h-[320px] w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 font-mono text-xs outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            <button
              disabled={isCreating}
              className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
            >
              {copy.templates.createButton}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
          <h2 className="text-xl font-semibold">{copy.templates.placeholders}</h2>
          <ul className="mt-4 space-y-2 font-mono text-xs text-[var(--muted)]">
            {placeholders.map((placeholder) => (
              <li key={placeholder}>{placeholder}</li>
            ))}
          </ul>
        </section>
      </section>
    </section>
  );
}
