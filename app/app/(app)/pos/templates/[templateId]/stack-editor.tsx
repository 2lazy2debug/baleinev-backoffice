"use client";

import { useActionState, useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import {
  Alert,
  Button,
  Card,
  IconButton,
  Modal,
  PageHeader,
  Panel,
  PanelHeader,
  SectionTitle,
  SegmentedControl,
  buttonClasses,
  cn,
  compactOnMobileWidths,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { COLUMN_CHOICES, drawnSlots, pageCount, tilesOnPage, tilesPerPage } from "@/lib/pos-layout";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

import { columnClasses, normalizeColumns, useTillColumns } from "../../till-columns";
import { removePosTemplateCellAction, reorderPosTemplateCellsAction } from "../../actions";
import { TileFormModal, type ArticleOption, type EditorCell } from "./tile-form-modal";
import type { ConversionOption, UnitOption } from "@/components/unit-size-fields";

export type { ArticleOption, EditorCell };

type Props = {
  locale: Locale;
  templateId: string;
  templateName: string;
  cells: EditorCell[];
  articles: ArticleOption[];
  units: UnitOption[];
  conversions: ConversionOption[];
  isReadOnly: boolean;
  /** Article id → the name the catalogue currently gives it, for the list's subtitle. */
  articleNames: Record<string, string>;
};

const REMOVE_FORM_ID = "pos-tile-remove";

/** Moves one item of a list to another index, without mutating it. */
function moved<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * The template editor: **a stack, not a grid**.
 *
 * A template used to be authored page by page in a 3×3, which meant the author
 * was deciding where the page breaks fell. They are not the author's to decide
 * any more — the till pages the same stack differently on a phone at 3 columns
 * and on a counter tablet at 6 — so this screen is a plain ordered list, and
 * the grid is what **Preview** shows, at whatever width this device sells at.
 *
 * Reordering works the same in both views because it is one `move()`: the list
 * has drag, arrows and keyboard; the preview has drag and a tap-to-pick, tap-
 * to-place pass that a touchscreen can actually do. The order is written
 * straight through to the server — a drag is not a form, and the screen has
 * already moved the tile.
 */
export function StackEditor({
  locale,
  templateId,
  templateName,
  cells,
  articles,
  units,
  conversions,
  isReadOnly,
  articleNames,
}: Props) {
  const copy = dictionaries[locale].pos;
  const shell = dictionaries[locale].shell;
  const router = useRouter();

  // The order this screen is showing. It runs ahead of the server between a
  // drag and the revalidation that follows it, and re-seeds whenever the server
  // sends a different stack — an add, a remove, or the reorder landing.
  const serverKey = cells.map((cell) => cell.id).join(",");
  const [seededFrom, setSeededFrom] = useState(serverKey);
  const [order, setOrder] = useState(cells);

  if (seededFrom !== serverKey) {
    setSeededFrom(serverKey);
    setOrder(cells);
  }

  const [reordering, startReorder] = useTransition();
  const [reorderError, setReorderError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ cell: EditorCell | null } | null>(null);
  const [removing, setRemoving] = useState<EditorCell | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [removeState, removeAction, removePending] = useActionState(
    removePosTemplateCellAction,
    initialActionState,
  );
  const markRemoved = useCloseOnSuccess(removeState, removePending, () => {
    setRemoving(null);
    router.refresh();
  });

  // The new order is worked out here rather than inside a `setOrder` updater:
  // an updater runs during render, and starting a transition from there is what
  // React means by "cannot call startTransition while rendering".
  const move = useCallback(
    (from: number, to: number) => {
      if (isReadOnly) {
        return;
      }

      const next = moved(order, from, to);
      if (next === order) {
        return;
      }

      setOrder(next);
      setReorderError(null);
      startReorder(async () => {
        const result = await reorderPosTemplateCellsAction(
          templateId,
          next.map((cell) => cell.id),
        );
        if (result.error) {
          setReorderError(result.error);
          router.refresh();
        }
      });
    },
    [isReadOnly, order, router, templateId],
  );

  const tileLabel = (cell: EditorCell) => (cell.kind === "SPACER" ? copy.whitespace : cell.label);

  const headerActions = (
    <>
      <Link
        href="/pos/templates"
        title={copy.backToTemplates}
        aria-label={copy.backToTemplates}
        className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
      >
        <ArrowLeft />
        <span className="hidden lg:inline">{copy.backToTemplates}</span>
      </Link>
      <Button
        type="button"
        variant="secondary"
        icon={<Eye />}
        compactOnMobile
        onClick={() => setPreviewOpen(true)}
      >
        {copy.preview}
      </Button>
      {isReadOnly ? null : (
        <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setEditing({ cell: null })}>
          {copy.addTile}
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader eyebrow={copy.title} title={templateName} description={copy.stackHint} actions={headerActions} />

      {reorderError ? <Alert tone="error">{reorderError}</Alert> : null}

      <Panel flushOnMobile>
        <PanelHeader flushOnMobile>
          <SectionTitle desktopOnly>{copy.tiles}</SectionTitle>
        </PanelHeader>

        {order.length === 0 ? (
          <div className="px-3 py-6 text-center sm:px-5">
            <p className="text-sm font-medium">{copy.noTiles}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{copy.noTilesHint}</p>
          </div>
        ) : (
          <ul className={cn("divide-y divide-[var(--line)]", reordering ? "opacity-70" : null)}>
            {order.map((cell, index) => (
              <StackRow
                key={cell.id}
                cell={cell}
                index={index}
                total={order.length}
                label={tileLabel(cell)}
                articleName={cell.elementId ? (articleNames[cell.elementId] ?? "") : ""}
                copy={copy}
                isReadOnly={isReadOnly}
                onMove={move}
                onEdit={() => setEditing({ cell })}
                onRemove={() => setRemoving(cell)}
              />
            ))}
          </ul>
        )}
      </Panel>

      <TileFormModal
        locale={locale}
        templateId={templateId}
        articles={articles}
        units={units}
        conversions={conversions}
        open={editing !== null}
        cell={editing?.cell ?? null}
        onClose={() => setEditing(null)}
      />

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        copy={copy}
        order={order}
        isReadOnly={isReadOnly}
        onMove={move}
      />

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={copy.removeTile}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setRemoving(null)}>
              {shell.cancel}
            </Button>
            <Button type="submit" form={REMOVE_FORM_ID} variant="destructive" disabled={removePending}>
              {copy.removeTile}
            </Button>
          </>
        }
      >
        {removing ? (
          <form id={REMOVE_FORM_ID} action={removeAction} onSubmit={markRemoved} className="space-y-4">
            <FormError message={removeState.error} />
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="cellId" value={removing.id} />
            <p className="text-sm">{copy.removeTileConfirm.replace("{tile}", tileLabel(removing))}</p>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}

/**
 * The POS block of *a* dictionary, as the two sub-components below read it. The
 * literal types differ between en and fr, so it is the union — a component that
 * only prints these strings must not be typed to one language's wording.
 */
type RowCopy = (typeof dictionaries)[Locale]["pos"];

/**
 * One tile in the stack. Draggable for a mouse, arrowed for a thumb — the two
 * are the same `onMove`, so neither view has an order the other cannot make.
 */
function StackRow({
  cell,
  index,
  total,
  label,
  articleName,
  copy,
  isReadOnly,
  onMove,
  onEdit,
  onRemove,
}: {
  cell: EditorCell;
  index: number;
  total: number;
  label: string;
  articleName: string;
  copy: RowCopy;
  isReadOnly: boolean;
  onMove: (from: number, to: number) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const spacer = cell.kind === "SPACER";

  return (
    <li
      draggable={!isReadOnly}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", String(index));
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (!isReadOnly) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer.getData("text/plain"));
        if (Number.isInteger(from)) {
          onMove(from, index);
        }
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 sm:px-5 sm:py-3",
        isReadOnly ? null : "cursor-grab active:cursor-grabbing",
      )}
    >
      <GripVertical className={cn("h-4 w-4 shrink-0", isReadOnly ? "opacity-0" : "text-[var(--muted)]")} />
      <span className="w-6 shrink-0 text-2xs tabular-nums text-[var(--muted)]">{index + 1}</span>

      {/* The article's own name only when the tile is *not* called that. A tile
          reading "Beer 3dl" over "Feldschlösschen Original 30 cl" says something;
          the same word twice says nothing. */}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", spacer ? "italic text-[var(--muted)]" : null)}>{label}</p>
        {!spacer && articleName && articleName !== label ? (
          <p className="truncate text-2xs text-[var(--muted)]">{articleName}</p>
        ) : null}
      </div>

      {spacer ? null : (
        <span className="shrink-0 text-sm tabular-nums">{formatCurrency(Number(cell.price))}</span>
      )}

      {isReadOnly ? null : (
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            size="sm"
            tone="neutral"
            label={copy.moveUp}
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
          >
            <ChevronUp />
          </IconButton>
          <IconButton
            size="sm"
            tone="neutral"
            label={copy.moveDown}
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
          >
            <ChevronDown />
          </IconButton>
          <IconButton size="sm" tone="neutral" label={copy.editTile} onClick={onEdit}>
            <Pencil />
          </IconButton>
          <IconButton size="sm" tone="delete" label={copy.removeTile} onClick={onRemove}>
            <Trash2 />
          </IconButton>
        </div>
      )}
    </li>
  );
}

/**
 * The stack as the till will draw it, at this device's own column count — the
 * same `pos:columns` the till reads, so the preview is not an approximation of
 * the seller's screen, it is it.
 *
 * Tiles reorder here too. Dragging is for a mouse; **tap one tile then tap
 * where it goes** is the same move for a thumb, and a template is more often
 * laid out on the tablet it will be sold from than on a desk.
 */
function PreviewModal({
  open,
  onClose,
  copy,
  order,
  isReadOnly,
  onMove,
}: {
  open: boolean;
  onClose: () => void;
  copy: RowCopy;
  order: EditorCell[];
  isReadOnly: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const { columns, chooseColumns } = useTillColumns();
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const totalPages = pageCount(order.length, columns);
  const currentPage = Math.min(page, totalPages - 1);
  const pageTiles = tilesOnPage(order, currentPage, columns);
  const slots = drawnSlots(pageTiles.length, columns);
  const firstOnPage = currentPage * tilesPerPage(columns);

  function place(target: number) {
    if (picked === null) {
      setPicked(target);
      return;
    }
    if (picked !== target) {
      onMove(picked, target);
    }
    setPicked(null);
  }

  return (
    <Modal open={open} onClose={onClose} title={copy.preview} size="xl" mobileFullScreen>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {totalPages > 1 ? (
            <div className="flex items-center gap-3">
              <IconButton
                size="sm"
                tone="neutral"
                label={copy.previousPage}
                disabled={currentPage === 0}
                onClick={() => setPage(Math.max(0, currentPage - 1))}
              >
                <ChevronLeft />
              </IconButton>
              <span className="text-sm tabular-nums text-[var(--muted)]">
                {copy.pageOf.replace("{page}", String(currentPage + 1)).replace("{total}", String(totalPages))}
              </span>
              <IconButton
                size="sm"
                tone="neutral"
                label={copy.nextPage}
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight />
              </IconButton>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              {copy.columns}
            </span>
            <SegmentedControl
              size="sm"
              options={COLUMN_CHOICES.map((count) => ({ value: String(count), label: String(count) }))}
              value={String(columns)}
              onChange={(value) => chooseColumns(normalizeColumns(value))}
            />
          </div>
        </div>

        {isReadOnly ? null : <p className="text-center text-xs text-[var(--muted)]">{copy.previewReorderHint}</p>}

        <div className={cn("grid gap-2", columnClasses[columns])}>
          {Array.from({ length: slots }, (_, slot) => {
            if (slot === slots - 1) {
              return (
                <Card key="custom" as="div" span="auto" dashed className="flex min-h-24 flex-col items-center justify-center gap-1 p-2 text-center opacity-60 sm:p-3">
                  <Plus className="h-4 w-4" />
                  <span className="text-2xs font-medium uppercase tracking-[0.08em]">{copy.customSale}</span>
                </Card>
              );
            }

            const tile = pageTiles[slot];

            if (!tile) {
              return <div key={`blank-${slot}`} className="min-h-24" />;
            }

            const index = firstOnPage + slot;
            const spacer = tile.kind === "SPACER";

            return (
              <Card
                key={tile.id}
                as="div"
                span="auto"
                dashed={spacer}
                role={isReadOnly ? undefined : "button"}
                tabIndex={isReadOnly ? undefined : 0}
                aria-label={spacer ? copy.whitespace : tile.label}
                aria-pressed={isReadOnly ? undefined : picked === index}
                draggable={!isReadOnly}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", String(index));
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (!isReadOnly) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = Number(event.dataTransfer.getData("text/plain"));
                  if (Number.isInteger(from)) {
                    onMove(from, index);
                    setPicked(null);
                  }
                }}
                onClick={isReadOnly ? undefined : () => place(index)}
                onKeyDown={
                  isReadOnly
                    ? undefined
                    : (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          place(index);
                        }
                      }
                }
                className={cn(
                  "flex min-h-24 flex-col items-center justify-center gap-1 p-2 text-center transition sm:p-3",
                  isReadOnly ? null : "cursor-grab active:cursor-grabbing",
                  picked === index ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : null,
                )}
              >
                {spacer ? (
                  <span className="text-2xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    {copy.whitespace}
                  </span>
                ) : (
                  <>
                    <span className="line-clamp-2 text-sm font-medium text-[var(--ink)]">{tile.label}</span>
                    <span className="text-sm tabular-nums text-[var(--ink)]">{formatCurrency(Number(tile.price))}</span>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
