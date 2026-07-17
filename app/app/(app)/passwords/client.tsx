"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";

import { FormError } from "@/components/form-error";
import { buttonClasses } from "@/lib/button-classes";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import {
  createPasswordEntryAction,
  deletePasswordEntryAction,
  getTotpCodeAction,
  revealPasswordAction,
  updatePasswordEntryAction,
} from "./actions";

type DepartmentOption = { id: string; name: string };

type PasswordEntryItem = {
  id: string;
  name: string;
  login: string;
  website: string | null;
  has2fa: boolean;
  departmentRoles: DepartmentOption[];
};

type Props = {
  locale: Locale;
  entries: PasswordEntryItem[];
  assignableDepartments: DepartmentOption[];
  isAdmin: boolean;
};

const inputClass =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]";

function CopyButton({ getValue, label }: { getValue: () => Promise<string | null>; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const value = await getValue();
    if (value == null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — nothing to do.
    }
  }

  return (
    <button type="button" onClick={handleCopy} title={label} aria-label={label} className={buttonClasses.icon.action}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function PasswordsPageClient({ locale, entries, assignableDepartments, isAdmin }: Props) {
  const copy = dictionaries[locale].passwords;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PasswordEntryItem | null>(null);
  const [deleting, setDeleting] = useState<PasswordEntryItem | null>(null);

  const [createState, createAction, isCreating] = useActionState(createPasswordEntryAction, initialActionState);
  const [updateState, updateAction, isUpdating] = useActionState(updatePasswordEntryAction, initialActionState);
  const [deleteState, deleteAction, isDeleting] = useActionState(deletePasswordEntryAction, initialActionState);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[var(--muted)]">
          {entries.length} {entries.length === 1 ? copy.entrySingular : copy.entryPlural}
        </p>
        <button type="button" onClick={() => setIsCreateOpen(true)} className={buttonClasses.primary}>
          <span className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {copy.add}
          </span>
        </button>
      </div>

      <FormError message={deleteState.error} />

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)]">
          {copy.empty}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              copy={copy}
              onEdit={() => setEditing(entry)}
              onDelete={() => setDeleting(entry)}
            />
          ))}
        </div>
      )}

      {isCreateOpen ? (
        <EntryDialog
          title={copy.createTitle}
          copy={copy}
          assignableDepartments={assignableDepartments}
          isAdmin={isAdmin}
          formAction={createAction}
          pending={isCreating}
          error={createState.error}
          onClose={() => setIsCreateOpen(false)}
          closeOnSuccessKey={createState}
        />
      ) : null}

      {editing ? (
        <EntryDialog
          title={copy.editTitle}
          copy={copy}
          assignableDepartments={assignableDepartments}
          isAdmin={isAdmin}
          entry={editing}
          formAction={updateAction}
          pending={isUpdating}
          error={updateState.error}
          onClose={() => setEditing(null)}
          closeOnSuccessKey={updateState}
        />
      ) : null}

      {deleting ? (
        <DeleteDialog
          entry={deleting}
          copy={copy}
          formAction={deleteAction}
          pending={isDeleting}
          error={deleteState.error}
          onClose={() => setDeleting(null)}
          closeOnSuccessKey={deleteState}
        />
      ) : null}
    </section>
  );
}

type Copy = (typeof dictionaries)[Locale]["passwords"];

function EntryCard({
  entry,
  copy,
  onEdit,
  onDelete,
}: {
  entry: PasswordEntryItem;
  copy: Copy;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [isRevealing, startReveal] = useTransition();

  const [totp, setTotp] = useState<{ code: string; secondsRemaining: number } | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [isLoadingTotp, startTotp] = useTransition();

  function toggleReveal() {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setRevealError(null);
    startReveal(async () => {
      const result = await revealPasswordAction(entry.id);
      if (result.ok) {
        setRevealed(result.value);
      } else {
        setRevealError(result.error);
      }
    });
  }

  function loadTotp() {
    setTotpError(null);
    startTotp(async () => {
      const result = await getTotpCodeAction(entry.id);
      if (result.ok) {
        setTotp({ code: result.code, secondsRemaining: result.secondsRemaining });
      } else {
        setTotpError(result.error);
      }
    });
  }

  async function fetchPasswordValue() {
    if (revealed) {
      return revealed;
    }
    const result = await revealPasswordAction(entry.id);
    return result.ok ? result.value : null;
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 shrink-0 text-[var(--accent)]" />
            <h2 className="truncate text-base font-semibold">{entry.name}</h2>
          </div>
          <p className="mt-1 truncate text-sm text-[var(--muted)]">{entry.login}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={onEdit} title={copy.edit} aria-label={copy.edit} className={buttonClasses.icon.edit}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDelete} title={copy.delete} aria-label={copy.delete} className={buttonClasses.icon.delete}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">{copy.fieldPassword}</span>
          <code className="min-w-0 flex-1 truncate rounded-md bg-[var(--panel)] px-2 py-1 font-mono text-xs">
            {revealed ?? "••••••••••"}
          </code>
          <button
            type="button"
            onClick={toggleReveal}
            disabled={isRevealing}
            title={revealed ? copy.hide : copy.reveal}
            aria-label={revealed ? copy.hide : copy.reveal}
            className={buttonClasses.icon.action}
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <CopyButton getValue={fetchPasswordValue} label={copy.copyPassword} />
        </div>
        {revealError ? <p className="text-xs text-rose-300">{revealError}</p> : null}

        {entry.has2fa ? (
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">{copy.field2fa}</span>
            {totp ? (
              <>
                <code className="flex-1 rounded-md bg-[var(--panel)] px-2 py-1 font-mono text-sm tracking-[0.3em]">
                  {totp.code}
                </code>
                <span className="w-8 shrink-0 text-right text-xs tabular-nums text-[var(--muted)]">{totp.secondsRemaining}s</span>
                <CopyButton getValue={async () => totp.code} label={copy.copyCode} />
              </>
            ) : (
              <button
                type="button"
                onClick={loadTotp}
                disabled={isLoadingTotp}
                className="inline-flex flex-1 items-center gap-2 rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)] disabled:opacity-60"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {isLoadingTotp ? copy.loading : copy.show2faCode}
              </button>
            )}
          </div>
        ) : null}
        {totpError ? <p className="text-xs text-rose-300">{totpError}</p> : null}

        {entry.website ? (
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">{copy.fieldWebsite}</span>
            <a
              href={entry.website}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-xs text-[var(--accent)] hover:underline"
            >
              {entry.website}
            </a>
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {entry.departmentRoles.map((role) => (
          <span
            key={role.id}
            className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]"
          >
            {role.name}
          </span>
        ))}
      </div>
    </article>
  );
}

function EntryDialog({
  title,
  copy,
  assignableDepartments,
  isAdmin,
  entry,
  formAction,
  pending,
  error,
  onClose,
  closeOnSuccessKey,
}: {
  title: string;
  copy: Copy;
  assignableDepartments: DepartmentOption[];
  isAdmin: boolean;
  entry?: PasswordEntryItem;
  formAction: (payload: FormData) => void;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  closeOnSuccessKey: { error: string | null };
}) {
  const [submitted, setSubmitted] = useState(false);

  // Close after a submission that produced no error.
  useEffect(() => {
    if (submitted && !pending && closeOnSuccessKey.error === null) {
      onClose();
    }
  }, [submitted, pending, closeOnSuccessKey, onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-lg">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)]" aria-label={copy.cancel}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={formAction} onSubmit={() => setSubmitted(true)} className="space-y-4">
          {entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}
          <FormError message={error} />

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{copy.fieldName}</span>
            <input type="text" name="name" required defaultValue={entry?.name ?? ""} placeholder="Canva" className={inputClass} />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{copy.fieldLogin}</span>
            <input type="text" name="login" required defaultValue={entry?.login ?? ""} placeholder="team@baleinev.ch" className={inputClass} autoComplete="off" />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{entry ? copy.fieldPasswordEdit : copy.fieldPassword}</span>
            <input
              type="password"
              name="password"
              required={!entry}
              placeholder={entry ? copy.passwordUnchanged : "••••••••"}
              className={inputClass}
              autoComplete="new-password"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{copy.field2fa}</span>
            <input
              type="text"
              name="totp"
              placeholder={copy.field2faHint}
              defaultValue=""
              className={`${inputClass} font-mono`}
              autoComplete="off"
            />
            <span className="block text-xs text-[var(--muted)]">{copy.field2faHelp}</span>
          </label>
          {entry?.has2fa ? (
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input type="checkbox" name="clearTotp" />
              {copy.clear2fa}
            </label>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{copy.fieldWebsite}</span>
            <input type="url" name="website" defaultValue={entry?.website ?? ""} placeholder="https://…" className={inputClass} />
          </label>

          <div className="block space-y-1.5">
            <span className="text-sm font-medium">{copy.fieldDepartments}</span>
            <select
              name="departmentRoleIds"
              multiple
              required
              defaultValue={(entry?.departmentRoles ?? []).filter((role) => assignableDepartments.some((d) => d.id === role.id)).map((role) => role.id)}
              size={Math.min(Math.max(assignableDepartments.length, 3), 8)}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
            >
              {assignableDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <span className="block text-xs text-[var(--muted)]">
              {isAdmin ? copy.departmentsHelpAdmin : copy.departmentsHelp}
            </span>
            {entry && !isAdmin && (entry.departmentRoles ?? []).some((role) => !assignableDepartments.some((d) => d.id === role.id)) ? (
              <span className="block text-xs text-[var(--muted)]">{copy.departmentsForeignNote}</span>
            ) : null}
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className={buttonClasses.text.cancel}>
              {copy.cancel}
            </button>
            <button type="submit" disabled={pending} className={buttonClasses.text.primary}>
              {pending ? copy.saving : copy.save}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function DeleteDialog({
  entry,
  copy,
  formAction,
  pending,
  error,
  onClose,
  closeOnSuccessKey,
}: {
  entry: PasswordEntryItem;
  copy: Copy;
  formAction: (payload: FormData) => void;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  closeOnSuccessKey: { error: string | null };
}) {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted && !pending && closeOnSuccessKey.error === null) {
      onClose();
    }
  }, [submitted, pending, closeOnSuccessKey, onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-lg">
        <h2 className="text-xl font-semibold">{copy.deleteTitle}</h2>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {copy.deleteConfirm} <span className="font-semibold text-[var(--ink)]">{entry.name}</span>?
        </p>
        <FormError message={error} className="mt-4" />
        <form action={formAction} onSubmit={() => setSubmitted(true)} className="mt-6 flex items-center justify-end gap-2">
          <input type="hidden" name="entryId" value={entry.id} />
          <button type="button" onClick={onClose} className={buttonClasses.text.cancel}>
            {copy.cancel}
          </button>
          <button type="submit" disabled={pending} className={buttonClasses.text.delete}>
            {pending ? copy.deleting : copy.delete}
          </button>
        </form>
      </div>
    </>
  );
}
