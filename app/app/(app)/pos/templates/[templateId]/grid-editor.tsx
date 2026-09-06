"use client";

import { useActionState, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Card, Field, IconButton, Input, Modal, Select, cn } from "@/components/ui";
import { POS_PAGE_SLOTS } from "@/lib/cash";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

import { clearPosTemplateCellAction, setPosTemplateCellAction } from "../../actions";

export type EditorCell = {
  id: string;
  position: number;
  elementId: string;
  label: string;
  /** A `Decimal(10,2)` as a string — "4.00", "-2.00". */
  price: string;
};

export type ArticleOption = { id: string; name: string };

type Props = {
  locale: Locale;
  templateId: string;
  cells: EditorCell[];
  articles: ArticleOption[];
  isReadOnly: boolean;
};

const SET_FORM_ID = "pos-cell-form";
const CLEAR_FORM_ID = "pos-cell-clear-form";

/**
 * The tile surface — dashed while empty, solid once filled. Reuses <Card> so no
 * screen re-invents the dashed border (see the design rules). With `onActivate`
 * it is a `role="button"` target (a real <button> may not wrap the <div> a Card
 * renders); without it, static — the read-only editor and the custom-sale tile.
 */
function Tile({
  dashed,
  onActivate,
  label,
  className,
  children,
}: {
  dashed: boolean;
  onActivate?: () => void;
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      as="div"
      dashed={dashed}
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={onActivate ? label : undefined}
      onClick={onActivate}
      onKeyDown={
        onActivate
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
      className={cn(
        "flex h-full min-h-24 flex-col items-center justify-center gap-1 p-2 text-center sm:p-3",
        onActivate && "cursor-pointer transition hover:border-[var(--accent)]",
        className,
      )}
    >
      {children}
    </Card>
  );
}

export function GridEditor({ locale, templateId, cells, articles, isReadOnly }: Props) {
  const copy = dictionaries[locale].pos;
  const shell = dictionaries[locale].shell;
  const router = useRouter();

  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ position: number; cell: EditorCell | null } | null>(null);

  const cellAt = new Map(cells.map((cell) => [cell.position, cell]));
  const articleName = new Map(articles.map((article) => [article.id, article.name]));

  // Pages come from the highest slot in use, not the tile count — a page may
  // have holes. One empty page past the last used one is always reachable:
  // paging right is how "add a page" works, so there is no button.
  const usedPageCount = cells.reduce(
    (max, cell) => Math.max(max, Math.floor(cell.position / POS_PAGE_SLOTS) + 1),
    1,
  );
  const canPageRight = page < usedPageCount;
  const totalPages = Math.max(usedPageCount, page + 1);

  const [setState, setAction, setPending] = useActionState(setPosTemplateCellAction, initialActionState);
  const [clearState, clearAction, clearPending] = useActionState(clearPosTemplateCellAction, initialActionState);

  const close = useCallback(() => {
    setEditing(null);
    router.refresh();
  }, [router]);

  const markSet = useCloseOnSuccess(setState, setPending, close);
  const markClear = useCloseOnSuccess(clearState, clearPending, close);

  // Controlled so picking an article can prefill the still-editable label. Reset
  // during render when the dialog points at a different slot (the pattern from
  // article-form-modal).
  const editingKey = editing ? `${editing.position}:${editing.cell?.id ?? "new"}` : null;
  const [formKey, setFormKey] = useState<string | null>(null);
  const [form, setForm] = useState({ elementId: "", label: "", price: "" });

  if (editingKey !== formKey) {
    setFormKey(editingKey);
    setForm(
      editing?.cell
        ? { elementId: editing.cell.elementId, label: editing.cell.label, price: editing.cell.price }
        : { elementId: "", label: "", price: "" },
    );
  }

  function pickArticle(elementId: string) {
    setForm((current) => {
      const previousName = articleName.get(current.elementId);
      const labelUntouched = current.label.trim() === "" || current.label === previousName;
      return {
        ...current,
        elementId,
        label: labelUntouched ? articleName.get(elementId) ?? "" : current.label,
      };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <IconButton
          size="sm"
          tone="neutral"
          label={copy.previousPage}
          disabled={page === 0}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
        >
          <ChevronLeft />
        </IconButton>
        <span className="text-sm tabular-nums text-[var(--muted)]">
          {copy.pageOf.replace("{page}", String(page + 1)).replace("{total}", String(totalPages))}
        </span>
        <IconButton
          size="sm"
          tone="neutral"
          label={copy.nextPage}
          disabled={!canPageRight}
          onClick={() => setPage((current) => current + 1)}
        >
          <ChevronRight />
        </IconButton>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, slot) => {
          if (slot === POS_PAGE_SLOTS) {
            // The ninth tile of every page is "custom sale" — drawn, never
            // stored, so the editor shows the layout the till will show.
            return (
              <Tile key="custom" dashed className="opacity-60">
                <Plus className="h-4 w-4" />
                <span className="text-2xs font-medium uppercase tracking-[0.08em]">{copy.customSale}</span>
              </Tile>
            );
          }

          const position = page * POS_PAGE_SLOTS + slot;
          const cell = cellAt.get(position) ?? null;

          const body = cell ? (
            <>
              <span className="line-clamp-2 text-sm font-medium text-[var(--ink)]">{cell.label}</span>
              <span className="text-sm tabular-nums text-[var(--ink)]">{formatCurrency(Number(cell.price))}</span>
              <span className="line-clamp-1 text-2xs text-[var(--muted)]">{articleName.get(cell.elementId) ?? ""}</span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 text-[var(--muted)]" />
              <span className="text-2xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">{copy.emptySlot}</span>
            </>
          );

          return (
            <Tile
              key={position}
              dashed={!cell}
              label={cell ? `${cell.label} — ${copy.editTile}` : copy.addTile}
              onActivate={isReadOnly ? undefined : () => setEditing({ position, cell })}
            >
              {body}
            </Tile>
          );
        })}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.cell ? copy.editTile : copy.addTile}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              {shell.cancel}
            </Button>
            <Button type="submit" form={SET_FORM_ID} variant="primary" disabled={setPending || !form.elementId}>
              {shell.save}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <form id={SET_FORM_ID} action={setAction} onSubmit={markSet} className="space-y-4">
              <FormError message={setState.error} />
              <input type="hidden" name="templateId" value={templateId} />
              <input type="hidden" name="position" value={editing.position} />

              <Field label={copy.article}>
                <Select
                  name="elementId"
                  value={form.elementId}
                  onChange={(event) => pickArticle(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    {copy.article}
                  </option>
                  {articles.map((article) => (
                    <option key={article.id} value={article.id}>
                      {article.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={copy.tileLabel}>
                <Input
                  type="text"
                  name="label"
                  value={form.label}
                  onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                  required
                />
              </Field>

              <Field label={copy.price}>
                <Input
                  type="text"
                  inputMode="decimal"
                  name="price"
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                  required
                />
              </Field>
              <p className="text-xs text-[var(--muted)]">{copy.priceHint}</p>
            </form>

            {editing.cell ? (
              <form
                id={CLEAR_FORM_ID}
                action={clearAction}
                onSubmit={markClear}
                className="border-t border-[var(--line)] pt-4"
              >
                <FormError message={clearState.error} />
                <input type="hidden" name="templateId" value={templateId} />
                <input type="hidden" name="position" value={editing.position} />
                <Button type="submit" variant="destructive" icon={<Trash2 />} disabled={clearPending}>
                  {copy.removeTile}
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
