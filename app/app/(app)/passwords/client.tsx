"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
import { Badge, Button, Card, Checkbox, Field, IconButton, Input, Modal, MultiSelect, PageHeader, Panel } from "@/components/ui";
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
    <IconButton tone="neutral" label={label} onClick={handleCopy}>
      {copied ? <Check className="text-emerald-400" /> : <Copy />}
    </IconButton>
  );
}

export function PasswordsPageClient({ locale, entries, assignableDepartments, isAdmin }: Props) {
  const copy = dictionaries[locale].passwords;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PasswordEntryItem | null>(null);
  const [deleting, setDeleting] = useState<PasswordEntryItem | null>(null);
  const [query, setQuery] = useState("");

  const [createState, createAction, isCreating] = useActionState(createPasswordEntryAction, initialActionState);
  const [updateState, updateAction, isUpdating] = useActionState(updatePasswordEntryAction, initialActionState);
  const [deleteState, deleteAction, isDeleting] = useActionState(deletePasswordEntryAction, initialActionState);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return entries;
    }
    return entries.filter((entry) =>
      [entry.name, entry.login, entry.website ?? ""].some((field) => field.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.title}
        title={copy.heading}
        description={copy.subtitle}
        actions={
          <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
            <Plus />
            {copy.add}
          </Button>
        }
        // The search filters the list it sits above, so it belongs in the header
        // that stays pinned while that list scrolls — not in a strip below it.
        controls={
          <div className="flex items-center gap-3 lg:mt-4">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.search}
                aria-label={copy.search}
                className="pl-9"
              />
            </div>
            <p className="shrink-0 text-sm text-[var(--muted)]">
              {filtered.length} {filtered.length === 1 ? copy.entrySingular : copy.entryPlural}
            </p>
          </div>
        }
      />

      <FormError message={deleteState.error} />

      {entries.length === 0 ? (
        <Card span="full" dashed>
          {copy.empty}
        </Card>
      ) : filtered.length === 0 ? (
        <Card span="full" dashed>
          {copy.noResults}
        </Card>
      ) : (
        <Panel as="ul" className="divide-y divide-[var(--line)] bg-[var(--panel-strong)]">
          {filtered.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              copy={copy}
              onEdit={() => setEditing(entry)}
              onDelete={() => setDeleting(entry)}
            />
          ))}
        </Panel>
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
    </div>
  );
}

type Copy = (typeof dictionaries)[Locale]["passwords"];

function EntryRow({
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
    <li className="space-y-2.5 p-3">
      {/* Title: name (full width, never truncated) + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <KeyRound className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <p className="break-words text-sm font-semibold">{entry.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton tone="accent" label={copy.edit} onClick={onEdit}>
            <Pencil />
          </IconButton>
          <IconButton tone="delete" label={copy.delete} onClick={onDelete}>
            <Trash2 />
          </IconButton>
        </div>
      </div>

      {/* Details: username, password, info — column on mobile, row on desktop */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        {/* Username (never truncated) */}
        <div className="flex min-w-0 items-center gap-1.5 lg:w-56 lg:shrink-0">
          <span className="break-all text-xs text-[var(--muted)]">{entry.login}</span>
          <CopyButton getValue={async () => entry.login} label={copy.fieldLogin} />
        </div>

        {/* Password + 2FA */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-[var(--panel)] px-2 py-1 font-mono text-xs">
              {revealed ?? "••••••••••"}
            </code>
            <IconButton
              tone="neutral"
              label={revealed ? copy.hide : copy.reveal}
              onClick={toggleReveal}
              disabled={isRevealing}
            >
              {revealed ? <EyeOff /> : <Eye />}
            </IconButton>
            <CopyButton getValue={fetchPasswordValue} label={copy.copyPassword} />
            {entry.has2fa ? (
              totp ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--panel)] px-2 py-1">
                  <code className="font-mono text-xs tracking-[0.2em]">{totp.code}</code>
                  <span className="w-6 text-right text-3xs tabular-nums text-[var(--muted)]">{totp.secondsRemaining}s</span>
                  <CopyButton getValue={async () => totp.code} label={copy.copyCode} />
                </span>
              ) : (
                <Button variant="secondary" size="sm" onClick={loadTotp} disabled={isLoadingTotp}>
                  <ShieldCheck />
                  {isLoadingTotp ? copy.loading : copy.field2fa}
                </Button>
              )
            ) : null}
          </div>
          {revealError ? <p className="text-xs text-rose-300">{revealError}</p> : null}
          {totpError ? <p className="text-xs text-rose-300">{totpError}</p> : null}
        </div>

        {/* Info: website + departments */}
        <div className="flex flex-wrap items-center gap-1.5 lg:w-56 lg:shrink-0 lg:justify-end">
          {entry.website ? (
            <a
              href={entry.website}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-full truncate text-xs text-[var(--accent)] hover:underline"
            >
              {entry.website.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
          {entry.departmentRoles.map((role) => (
            <Badge key={role.id} tone="neutral">
              {role.name}
            </Badge>
          ))}
        </div>
      </div>
    </li>
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
    <Modal
      open
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" form="password-entry-form" variant="primary" disabled={pending}>
            {pending ? copy.saving : copy.save}
          </Button>
        </>
      }
    >
      <form id="password-entry-form" action={formAction} onSubmit={() => setSubmitted(true)} className="space-y-4">
        {entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}
        <FormError message={error} />

        <Field label={copy.fieldName}>
          <Input type="text" name="name" required defaultValue={entry?.name ?? ""} placeholder="Canva" />
        </Field>

        <Field label={copy.fieldLogin}>
          <Input
            type="text"
            name="login"
            required
            defaultValue={entry?.login ?? ""}
            placeholder="team@baleinev.ch"
            autoComplete="off"
          />
        </Field>

        <Field label={entry ? copy.fieldPasswordEdit : copy.fieldPassword}>
          <Input
            type="password"
            name="password"
            required={!entry}
            placeholder={entry ? copy.passwordUnchanged : "••••••••"}
            autoComplete="new-password"
          />
        </Field>

        <Field label={copy.field2fa}>
          <Input
            type="text"
            name="totp"
            placeholder={copy.field2faHint}
            defaultValue=""
            className="font-mono"
            autoComplete="off"
          />
          <span className="block text-xs text-[var(--muted)]">{copy.field2faHelp}</span>
        </Field>
        {entry?.has2fa ? <Checkbox id="clearTotp" name="clearTotp" label={copy.clear2fa} /> : null}

        <Field label={copy.fieldWebsite}>
          <Input type="url" name="website" defaultValue={entry?.website ?? ""} placeholder="https://…" />
        </Field>

        <Field label={copy.fieldDepartments}>
          <MultiSelect
            name="departmentRoleIds"
            required
            defaultValue={(entry?.departmentRoles ?? [])
              .filter((role) => assignableDepartments.some((d) => d.id === role.id))
              .map((role) => role.id)}
            rows={assignableDepartments.length}
          >
            {assignableDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </MultiSelect>
          <span className="block text-xs text-[var(--muted)]">
            {isAdmin ? copy.departmentsHelpAdmin : copy.departmentsHelp}
          </span>
          {entry && !isAdmin && (entry.departmentRoles ?? []).some((role) => !assignableDepartments.some((d) => d.id === role.id)) ? (
            <span className="block text-xs text-[var(--muted)]">{copy.departmentsForeignNote}</span>
          ) : null}
        </Field>
      </form>
    </Modal>
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
    <Modal
      open
      onClose={onClose}
      title={copy.deleteTitle}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" form="password-delete-form" variant="destructive" disabled={pending}>
            {pending ? copy.deleting : copy.delete}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--muted)]">
        {copy.deleteConfirm} <span className="font-semibold text-[var(--ink)]">{entry.name}</span>?
      </p>
      <FormError message={error} className="mt-4" />
      <form id="password-delete-form" action={formAction} onSubmit={() => setSubmitted(true)}>
        <input type="hidden" name="entryId" value={entry.id} />
      </form>
    </Modal>
  );
}
