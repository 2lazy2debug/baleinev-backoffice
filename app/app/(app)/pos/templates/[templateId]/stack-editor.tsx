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
  FilePlus,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import {
  Alert,
  Badge,
  Button,
  Card,
  IconButton,
  Modal,
  PageHeader,
  Panel,
  PanelEmpty,
  PanelHeader,
  SectionTitle,
  SegmentedControl,
  buttonClasses,
  cn,
  compactOnMobileWidths,
  microLabelClasses,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import {
  COLUMN_CHOICES,
  drawnSlots,
  pageCount,
  pageTitle,
  tilesOnPage,
  tilesPerPage,
  tillScreens,
} from "@/lib/pos-layout";
import { tileColorStyle, tileSwatchStyle } from "@/lib/pos-tile-colors";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

import { columnClasses, normalizeColumns, useTillColumns } from "../../till-columns";
import {
  removePosTemplateCellAction,
  removePosTemplatePageAction,
  reorderPosTemplateCellsAction,
  reorderPosTemplatePagesAction,
} from "../../actions";
import { PageFormModal } from "./page-form-modal";
import { TileFormModal, type ArticleOption, type EditorCell } from "./tile-form-modal";
import type { ConversionOption, UnitOption } from "@/components/unit-size-fields";

export type { ArticleOption, EditorCell };

/** A named page of the template, with its tiles in order. */
export type EditorPage = { id: string; title: string | null; cells: EditorCell[] };

type Props = {
  locale: Locale;
  templateId: string;
  templateName: string;
  pages: EditorPage[];
  articles: ArticleOption[];
  units: UnitOption[];
  conversions: ConversionOption[];
  isReadOnly: boolean;
  /** Article id → the name the catalogue currently gives it, for the list's subtitle. */
  articleNames: Record<string, string>;
};

/** Where a tile is: which page, and where on it. */
type Spot = { page: number; index: number };

const REMOVE_FORM_ID = "pos-tile-remove";
const REMOVE_PAGE_FORM_ID = "pos-page-remove";

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
 * Moves one tile, within its page or onto another. On the same page `to.index`
 * is where the tile ends up; on another page it is where it is inserted, and
 * anything past the end means "at the end". Returns the same layout when
 * nothing moved, so the caller can tell.
 */
function movedTile(layout: EditorPage[], from: Spot, to: Spot): EditorPage[] {
  const source = layout[from.page];
  const target = layout[to.page];
  if (!source || !target || from.index < 0 || from.index >= source.cells.length) {
    return layout;
  }

  if (from.page === to.page) {
    const cells = moved(source.cells, from.index, Math.min(to.index, source.cells.length - 1));
    return cells === source.cells ? layout : layout.map((page, i) => (i === from.page ? { ...page, cells } : page));
  }

  const cell = source.cells[from.index];
  const targetCells = [...target.cells];
  targetCells.splice(Math.max(0, Math.min(to.index, targetCells.length)), 0, cell);

  return layout.map((page, i) => {
    if (i === from.page) return { ...page, cells: page.cells.filter((_, j) => j !== from.index) };
    if (i === to.page) return { ...page, cells: targetCells };
    return page;
  });
}

/**
 * A page header being dragged carries its index under its own type, so a tile
 * drop target never mistakes it for a tile (and the other way round).
 */
const PAGE_DRAG_TYPE = "application/x-pos-page";

function pageFrom(event: React.DragEvent): number | null {
  if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return null;
  const index = Number(event.dataTransfer.getData(PAGE_DRAG_TYPE));
  return Number.isInteger(index) ? index : null;
}

/** A drag carries the spot it started from as `"page:index"`. */
function spotFrom(event: React.DragEvent): Spot | null {
  const [page, index] = event.dataTransfer.getData("text/plain").split(":").map(Number);
  return Number.isInteger(page) && Number.isInteger(index) ? { page, index } : null;
}

function startDrag(event: React.DragEvent, spot: Spot) {
  event.dataTransfer.setData("text/plain", `${spot.page}:${spot.index}`);
  event.dataTransfer.effectAllowed = "move";
}

/**
 * The template editor: **named pages, each a stack**.
 *
 * A page is a tab on the till — "Beers", "Softs", "Deposits" — and is drawn
 * here as an accordion holding its tiles in order. Pages reorder from their
 * headers (drag one onto another, or its arrows); tiles move within a page and
 * across pages. Where a long page overflows onto a
 * second screen is still not the author's to decide — the till pages the same
 * stack differently on a phone at 3 columns and on a counter tablet at 6 — so
 * the grid is what **Preview** shows, at whatever width this device sells at.
 *
 * Reordering works the same in both views because it is one `move()`: the
 * list has drag (onto a row, or onto a page's header to send it to the end of
 * that page), arrows that step over a page boundary, and the tile dialog's page
 * picker; the preview has drag and a tap-to-pick, tap-to-place pass that a
 * touchscreen can actually do. The layout is written straight through to the
 * server — a drag is not a form, and the screen has already moved the tile.
 */
export function StackEditor({
  locale,
  templateId,
  templateName,
  pages,
  articles,
  units,
  conversions,
  isReadOnly,
  articleNames,
}: Props) {
  const copy = dictionaries[locale].pos;
  const shell = dictionaries[locale].shell;
  const router = useRouter();

  // The layout this screen is showing. It runs ahead of the server between a
  // drag and the revalidation that follows it, and re-seeds whenever the server
  // sends something different — an add, an edit, a remove, or the reorder landing.
  const serverKey = JSON.stringify(pages);
  const [seededFrom, setSeededFrom] = useState(serverKey);
  const [layout, setLayout] = useState(pages);

  // One page open to start with; a page that has just been added opens itself.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(pages.slice(0, 1).map((page) => page.id)));
  // The page "Add a tile" puts a tile on: the one last opened.
  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? "");

  if (seededFrom !== serverKey) {
    const known = new Set(layout.map((page) => page.id));
    const added = pages.filter((page) => !known.has(page.id)).map((page) => page.id);
    setSeededFrom(serverKey);
    setLayout(pages);
    if (added.length > 0) {
      setOpenIds((current) => new Set([...current, ...added]));
      setActivePageId(added[added.length - 1]);
    }
  }

  const [reordering, startReorder] = useTransition();
  const [reorderError, setReorderError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ cell: EditorCell | null; pageId: string } | null>(null);
  const [removing, setRemoving] = useState<EditorCell | null>(null);
  const [pageForm, setPageForm] = useState<{ page: EditorPage | null } | null>(null);
  const [removingPage, setRemovingPage] = useState<EditorPage | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [removeState, removeAction, removePending] = useActionState(
    removePosTemplateCellAction,
    initialActionState,
  );
  const markRemoved = useCloseOnSuccess(removeState, removePending, () => {
    setRemoving(null);
    router.refresh();
  });

  const [removePageState, removePageAction, removePagePending] = useActionState(
    removePosTemplatePageAction,
    initialActionState,
  );
  const markPageRemoved = useCloseOnSuccess(removePageState, removePagePending, () => {
    setRemovingPage(null);
    router.refresh();
  });

  const titleOf = useCallback(
    (index: number) => pageTitle(layout[index]?.title ?? null, index, copy.untitledPage),
    [copy.untitledPage, layout],
  );

  function openPage(id: string) {
    setOpenIds((current) => new Set([...current, id]));
    setActivePageId(id);
  }

  function togglePage(id: string) {
    if (openIds.has(id)) {
      setOpenIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } else {
      openPage(id);
    }
  }

  // The new layout is worked out here rather than inside a `setLayout` updater:
  // an updater runs during render, and starting a transition from there is what
  // React means by "cannot call startTransition while rendering".
  const move = useCallback(
    (from: Spot, to: Spot) => {
      if (isReadOnly) {
        return;
      }

      const next = movedTile(layout, from, to);
      if (next === layout) {
        return;
      }

      // A tile sent to a closed page would vanish from view; open it.
      if (from.page !== to.page && next[to.page]) {
        const id = next[to.page].id;
        setOpenIds((current) => new Set([...current, id]));
      }

      setLayout(next);
      setReorderError(null);
      startReorder(async () => {
        const result = await reorderPosTemplateCellsAction(
          templateId,
          next.map((page) => ({ pageId: page.id, cellIds: page.cells.map((cell) => cell.id) })),
        );
        if (result.error) {
          setReorderError(result.error);
          router.refresh();
        }
      });
    },
    [isReadOnly, layout, router, templateId],
  );

  /** Moves a whole page — the till's tab order. Tiles stay on their page. */
  const movePage = useCallback(
    (from: number, to: number) => {
      if (isReadOnly) {
        return;
      }

      const next = moved(layout, from, to);
      if (next === layout) {
        return;
      }

      setLayout(next);
      setReorderError(null);
      startReorder(async () => {
        const result = await reorderPosTemplatePagesAction(
          templateId,
          next.map((page) => page.id),
        );
        if (result.error) {
          setReorderError(result.error);
          router.refresh();
        }
      });
    },
    [isReadOnly, layout, router, templateId],
  );

  const tileLabel = (cell: EditorCell) => (cell.kind === "SPACER" ? copy.whitespace : cell.label);
  const totalTiles = layout.reduce((sum, page) => sum + page.cells.length, 0);
  const pageOptions = layout.map((page, index) => ({ id: page.id, label: titleOf(index) }));
  const defaultPageId = layout.some((page) => page.id === activePageId) ? activePageId : (layout[0]?.id ?? "");

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
        <>
          <Button
            type="button"
            variant="secondary"
            icon={<FilePlus />}
            compactOnMobile
            onClick={() => setPageForm({ page: null })}
          >
            {copy.addPage}
          </Button>
          <Button
            type="button"
            variant="primary"
            icon={<Plus />}
            compactOnMobile
            onClick={() => setEditing({ cell: null, pageId: defaultPageId })}
          >
            {copy.addTile}
          </Button>
        </>
      )}
    </>
  );

  /**
   * Drop handlers for a page header or an empty page's body: a dragged page
   * takes this page's place, a dragged tile goes to the end of this page.
   */
  const appendDrop = (pageIndex: number) =>
    isReadOnly
      ? {}
      : {
          onDragOver: (event: React.DragEvent) => event.preventDefault(),
          onDrop: (event: React.DragEvent) => {
            event.preventDefault();
            const page = pageFrom(event);
            if (page !== null) {
              movePage(page, pageIndex);
              return;
            }
            const from = spotFrom(event);
            if (from) {
              move(from, { page: pageIndex, index: layout[pageIndex].cells.length });
            }
          },
        };

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader eyebrow={copy.title} title={templateName} description={copy.stackHint} actions={headerActions} />

      {reorderError ? <Alert tone="error">{reorderError}</Alert> : null}

      <div className={cn("space-y-3", reordering ? "opacity-70" : null)}>
        {layout.map((page, pageIndex) => {
          const open = openIds.has(page.id);
          const title = titleOf(pageIndex);
          const last = layout.length - 1;

          return (
            <Panel key={page.id} flushOnMobile>
              {/* `last:` drops the rule under a collapsed header — the panel's
                  own border already closes it. */}
              <PanelHeader
                flushOnMobile
                draggable={!isReadOnly && layout.length > 1}
                onDragStart={(event) => {
                  event.dataTransfer.setData(PAGE_DRAG_TYPE, String(pageIndex));
                  event.dataTransfer.effectAllowed = "move";
                }}
                className={cn(
                  "last:border-b-0",
                  !isReadOnly && layout.length > 1 ? "cursor-grab active:cursor-grabbing" : null,
                )}
                {...appendDrop(pageIndex)}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => togglePage(page.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-[var(--muted)] transition", open ? null : "-rotate-90")}
                  />
                  <SectionTitle as="h2" className="truncate">
                    {title}
                  </SectionTitle>
                  <Badge>{page.cells.length}</Badge>
                </button>

                {isReadOnly ? null : (
                  <div className="flex shrink-0 items-center gap-1">
                    {layout.length > 1 ? (
                      <>
                        <IconButton
                          size="sm"
                          tone="neutral"
                          label={copy.movePageUp}
                          disabled={pageIndex === 0}
                          onClick={() => movePage(pageIndex, pageIndex - 1)}
                        >
                          <ChevronUp />
                        </IconButton>
                        <IconButton
                          size="sm"
                          tone="neutral"
                          label={copy.movePageDown}
                          disabled={pageIndex === last}
                          onClick={() => movePage(pageIndex, pageIndex + 1)}
                        >
                          <ChevronDown />
                        </IconButton>
                      </>
                    ) : null}
                    <IconButton size="sm" tone="neutral" label={copy.editPage} onClick={() => setPageForm({ page })}>
                      <Pencil />
                    </IconButton>
                    {layout.length > 1 ? (
                      <IconButton size="sm" tone="delete" label={copy.removePage} onClick={() => setRemovingPage(page)}>
                        <Trash2 />
                      </IconButton>
                    ) : null}
                  </div>
                )}
              </PanelHeader>

              {!open ? null : page.cells.length === 0 ? (
                totalTiles === 0 ? (
                  <div className="px-3 py-6 text-center sm:px-5">
                    <p className="text-sm font-medium">{copy.noTiles}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{copy.noTilesHint}</p>
                  </div>
                ) : (
                  <PanelEmpty {...appendDrop(pageIndex)}>{copy.emptyPage}</PanelEmpty>
                )
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {page.cells.map((cell, index) => {
                    const firstOverall = pageIndex === 0 && index === 0;
                    const lastOverall = pageIndex === last && index === page.cells.length - 1;
                    // Past either end of a page, the arrows carry on into the next one.
                    const up: Spot =
                      index > 0
                        ? { page: pageIndex, index: index - 1 }
                        : { page: pageIndex - 1, index: layout[pageIndex - 1]?.cells.length ?? 0 };
                    const down: Spot =
                      index < page.cells.length - 1
                        ? { page: pageIndex, index: index + 1 }
                        : { page: pageIndex + 1, index: 0 };

                    return (
                      <StackRow
                        key={cell.id}
                        cell={cell}
                        spot={{ page: pageIndex, index }}
                        label={tileLabel(cell)}
                        articleName={cell.elementId ? (articleNames[cell.elementId] ?? "") : ""}
                        copy={copy}
                        isReadOnly={isReadOnly}
                        canMoveUp={!firstOverall}
                        canMoveDown={!lastOverall}
                        onMoveUp={() => move({ page: pageIndex, index }, up)}
                        onMoveDown={() => move({ page: pageIndex, index }, down)}
                        onDropOn={(from) => move(from, { page: pageIndex, index })}
                        onEdit={() => setEditing({ cell, pageId: page.id })}
                        onRemove={() => setRemoving(cell)}
                      />
                    );
                  })}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>

      <TileFormModal
        locale={locale}
        templateId={templateId}
        articles={articles}
        units={units}
        conversions={conversions}
        pages={pageOptions}
        pageId={editing?.pageId ?? defaultPageId}
        open={editing !== null}
        cell={editing?.cell ?? null}
        onClose={() => setEditing(null)}
      />

      <PageFormModal
        locale={locale}
        templateId={templateId}
        open={pageForm !== null}
        page={pageForm?.page ?? null}
        onClose={() => setPageForm(null)}
      />

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        copy={copy}
        layout={layout}
        titleOf={titleOf}
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

      <Modal
        open={removingPage !== null}
        onClose={() => setRemovingPage(null)}
        title={copy.removePage}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setRemovingPage(null)}>
              {shell.cancel}
            </Button>
            <Button
              type="submit"
              form={REMOVE_PAGE_FORM_ID}
              variant="destructive"
              disabled={removePagePending || (removingPage?.cells.length ?? 0) > 0}
            >
              {copy.removePage}
            </Button>
          </>
        }
      >
        {removingPage ? (
          <form id={REMOVE_PAGE_FORM_ID} action={removePageAction} onSubmit={markPageRemoved} className="space-y-4">
            <FormError message={removePageState.error} />
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="pageId" value={removingPage.id} />
            {(() => {
              const name = titleOf(layout.findIndex((page) => page.id === removingPage.id));
              return removingPage.cells.length > 0 ? (
                <Alert tone="warning">{copy.removePageHasTiles.replace("{page}", name)}</Alert>
              ) : (
                <p className="text-sm">{copy.removePageConfirm.replace("{page}", name)}</p>
              );
            })()}
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
 * One tile in a page's stack. Draggable for a mouse, arrowed for a thumb — the
 * two end in the same `move()`, so neither view has a layout the other cannot make.
 */
function StackRow({
  cell,
  spot,
  label,
  articleName,
  copy,
  isReadOnly,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDropOn,
  onEdit,
  onRemove,
}: {
  cell: EditorCell;
  spot: Spot;
  label: string;
  articleName: string;
  copy: RowCopy;
  isReadOnly: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDropOn: (from: Spot) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const spacer = cell.kind === "SPACER";

  return (
    <li
      draggable={!isReadOnly}
      onDragStart={(event) => startDrag(event, spot)}
      onDragOver={(event) => {
        if (!isReadOnly) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        // The header behind a row is a drop target too; this one wins.
        event.stopPropagation();
        const from = spotFrom(event);
        if (from) {
          onDropOn(from);
        }
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 sm:px-5 sm:py-3",
        isReadOnly ? null : "cursor-grab active:cursor-grabbing",
      )}
    >
      <GripVertical className={cn("h-4 w-4 shrink-0", isReadOnly ? "opacity-0" : "text-[var(--muted)]")} />
      <span className="w-6 shrink-0 text-2xs tabular-nums text-[var(--muted)]">{spot.index + 1}</span>

      {cell.color ? (
        <span className="h-3 w-3 shrink-0 rounded-full" style={tileSwatchStyle(cell.color)} />
      ) : null}

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
          <IconButton size="sm" tone="neutral" label={copy.moveUp} disabled={!canMoveUp} onClick={onMoveUp}>
            <ChevronUp />
          </IconButton>
          <IconButton size="sm" tone="neutral" label={copy.moveDown} disabled={!canMoveDown} onClick={onMoveDown}>
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
 * The template as the till will draw it, at this device's own column count —
 * the same `pos:columns` the till reads, and the same page tabs and pager, so
 * the preview is not an approximation of the seller's screen, it is it.
 *
 * Tiles move here too. Dragging is for a mouse; **tap one tile then tap where
 * it goes** is the same move for a thumb — and since the tab strip stays
 * usable while a tile is picked, that includes another page: pick, switch tab,
 * tap a tile to land before it or an empty slot to land at the end.
 */
function PreviewModal({
  open,
  onClose,
  copy,
  layout,
  titleOf,
  isReadOnly,
  onMove,
}: {
  open: boolean;
  onClose: () => void;
  copy: RowCopy;
  layout: EditorPage[];
  titleOf: (index: number) => string;
  isReadOnly: boolean;
  onMove: (from: Spot, to: Spot) => void;
}) {
  const { columns, chooseColumns } = useTillColumns();
  const [screen, setScreen] = useState(0);
  const [picked, setPicked] = useState<Spot | null>(null);

  const screens = tillScreens(layout.map((page) => page.cells.length), columns);
  const currentScreen = Math.min(screen, screens.length - 1);
  const { page: pageIndex, sub } = screens[currentScreen] ?? { page: 0, sub: 0 };
  const pageCells = layout[pageIndex]?.cells ?? [];
  const subTotal = pageCount(pageCells.length, columns);
  const pageTiles = tilesOnPage(pageCells, sub, columns);
  const slots = drawnSlots(pageTiles.length, columns);
  const firstOnPage = sub * tilesPerPage(columns);

  const pagerLabel =
    layout.length <= 1
      ? copy.pageOf.replace("{page}", String(currentScreen + 1)).replace("{total}", String(screens.length))
      : subTotal > 1
        ? `${titleOf(pageIndex)} · ${sub + 1}/${subTotal}`
        : titleOf(pageIndex);

  const isPicked = (spot: Spot) => picked !== null && picked.page === spot.page && picked.index === spot.index;

  function place(target: Spot) {
    if (picked === null) {
      setPicked(target);
      return;
    }
    if (!isPicked(target)) {
      onMove(picked, target);
    }
    setPicked(null);
  }

  /** An empty slot takes a picked or dragged tile to the end of this page. */
  const endOfPage: Spot = { page: pageIndex, index: pageCells.length };

  return (
    <Modal open={open} onClose={onClose} title={copy.preview} size="xl" mobileFullScreen>
      <div className="space-y-4">
        {layout.length > 1 ? (
          <SegmentedControl
            size="sm"
            scrollable
            options={layout.map((page, index) => ({ value: page.id, label: titleOf(index) }))}
            value={layout[pageIndex]?.id ?? ""}
            onChange={(id) => setScreen(screens.findIndex((entry) => layout[entry.page].id === id && entry.sub === 0))}
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {screens.length > 1 ? (
            <div className="flex items-center gap-3">
              <IconButton
                size="sm"
                tone="neutral"
                label={copy.previousPage}
                disabled={currentScreen === 0}
                onClick={() => setScreen(Math.max(0, currentScreen - 1))}
              >
                <ChevronLeft />
              </IconButton>
              <span className="text-sm tabular-nums text-[var(--muted)]">{pagerLabel}</span>
              <IconButton
                size="sm"
                tone="neutral"
                label={copy.nextPage}
                disabled={currentScreen >= screens.length - 1}
                onClick={() => setScreen(currentScreen + 1)}
              >
                <ChevronRight />
              </IconButton>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <span className={microLabelClasses}>{copy.columns}</span>
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
              return (
                <div
                  key={`blank-${slot}`}
                  className="min-h-24"
                  onClick={isReadOnly || picked === null ? undefined : () => place(endOfPage)}
                  onDragOver={isReadOnly ? undefined : (event) => event.preventDefault()}
                  onDrop={
                    isReadOnly
                      ? undefined
                      : (event) => {
                          event.preventDefault();
                          const from = spotFrom(event);
                          if (from) {
                            onMove(from, endOfPage);
                            setPicked(null);
                          }
                        }
                  }
                />
              );
            }

            const spot: Spot = { page: pageIndex, index: firstOnPage + slot };
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
                aria-pressed={isReadOnly ? undefined : isPicked(spot)}
                draggable={!isReadOnly}
                onDragStart={(event) => startDrag(event, spot)}
                onDragOver={(event) => {
                  if (!isReadOnly) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = spotFrom(event);
                  if (from) {
                    onMove(from, spot);
                    setPicked(null);
                  }
                }}
                onClick={isReadOnly ? undefined : () => place(spot)}
                onKeyDown={
                  isReadOnly
                    ? undefined
                    : (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          place(spot);
                        }
                      }
                }
                style={spacer ? undefined : tileColorStyle(tile.color)}
                className={cn(
                  "flex min-h-24 flex-col items-center justify-center gap-1 p-2 text-center transition sm:p-3",
                  isReadOnly ? null : "cursor-grab active:cursor-grabbing",
                  isPicked(spot) ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : null,
                )}
              >
                {spacer ? (
                  <span className={microLabelClasses}>{copy.whitespace}</span>
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
