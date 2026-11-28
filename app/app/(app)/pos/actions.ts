"use server";

import { revalidatePath } from "next/cache";
import { PosCellColor, PosCellKind, type Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveWritableEditionId } from "@/lib/edition-context";
import { type ActionState, getRequiredString, toActionErrorMessage } from "@/lib/server-action-helpers";

/**
 * The POS template writes. A template is configuration — admin-only, and a
 * closed edition does not get new ones — so every action starts with
 * `requireAdmin()` then `resolveWritableEditionId()`, and re-checks that the
 * `templateId` from the form belongs to that edition. A form field is never
 * trusted.
 *
 * A template is a list of **pages**, each an **ordered stack** of tiles: a
 * tile is added at the end of a page, edited by its own id, and removed by
 * closing the gap it leaves. Both `position`s — a page's in its template, a
 * tile's in its page — are dense 0-based indexes and stay dense: a hole in a
 * page's order would draw as a phantom tile on whatever screen it landed on.
 *
 * Pages do not move. Tiles do, within a page and across pages.
 */

function revalidateTemplate(templateId?: string) {
  revalidatePath("/pos/templates");
  if (templateId) {
    revalidatePath(`/pos/templates/${templateId}`);
  }
}

/** Accepts `,` as the decimal separator (the `journal/actions.ts` convention).
 *  Negative and zero are both valid — a deposit handed back is a negative tile. */
function parsePrice(formData: FormData): string {
  const raw = String(formData.get("price") ?? "").replace(",", ".").trim();
  const amount = Number(raw);

  if (!raw || !Number.isFinite(amount)) {
    throw new Error("Price must be a number.");
  }

  return amount.toFixed(2);
}

/**
 * Where the whole template is parked while its positions are rewritten.
 *
 * `(templateId, position)` is a plain unique index, so PostgreSQL checks it row
 * by row *inside* a single UPDATE: shifting an order down in place collides
 * with the rows that have not moved yet. Adding the same constant to every row
 * first cannot collide with anything, and every final position then lands in
 * free space. The migration that made positions dense does the same in SQL.
 */
const POSITION_PARK = 1_000_000;

/** Which tiles sit on which page, in order — the shape every reorder writes. */
export type PageLayout = { pageId: string; cellIds: string[] }[];

/**
 * Rewrites every tile of a template to the page and the 0..n-1 position the
 * layout gives it. The whole template is parked first, so a tile moving onto
 * another page lands in free space there too.
 */
async function renumber(tx: Prisma.TransactionClient, templateId: string, layout: PageLayout) {
  await tx.posTemplateCell.updateMany({
    where: { templateId },
    data: { position: { increment: POSITION_PARK } },
  });

  for (const { pageId, cellIds } of layout) {
    for (const [position, id] of cellIds.entries()) {
      await tx.posTemplateCell.update({ where: { id }, data: { pageId, position } });
    }
  }
}

/** The template's layout as it is stored, pages in order and tiles in order. */
async function storedLayout(tx: Prisma.TransactionClient, templateId: string): Promise<PageLayout> {
  const pages = await tx.posTemplatePage.findMany({
    where: { templateId },
    orderBy: { position: "asc" },
    select: { id: true, cells: { orderBy: { position: "asc" }, select: { id: true } } },
  });

  return pages.map((page) => ({ pageId: page.id, cellIds: page.cells.map((cell) => cell.id) }));
}

/** Every cell action trusts the edition, never the form's `templateId`. */
async function templateInEdition(templateId: string, editionId: string) {
  const template = await prisma.posTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, editionId: true },
  });

  if (!template || template.editionId !== editionId) {
    throw new Error("That template no longer exists. Refresh and try again.");
  }

  return template;
}

export async function createPosTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const name = getRequiredString(formData, "name");

    const clash = await prisma.posTemplate.findUnique({
      where: { editionId_name: { editionId, name } },
      select: { id: true },
    });

    if (clash) {
      throw new Error("A template with that name already exists.");
    }

    // A template always has a page to put the first tile on.
    await prisma.posTemplate.create({ data: { editionId, name, pages: { create: { position: 0 } } } });

    revalidateTemplate();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function renamePosTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");
    const name = getRequiredString(formData, "name");

    await templateInEdition(templateId, editionId);

    const clash = await prisma.posTemplate.findUnique({
      where: { editionId_name: { editionId, name } },
      select: { id: true },
    });

    if (clash && clash.id !== templateId) {
      throw new Error("A template with that name already exists.");
    }

    await prisma.posTemplate.update({ where: { id: templateId }, data: { name } });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deletePosTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");

    await templateInEdition(templateId, editionId);

    const sessionCount = await prisma.posSession.count({ where: { templateId } });
    if (sessionCount > 0) {
      throw new Error("A session has used this template. It cannot be deleted.");
    }

    // The cells cascade; sessions are `Restrict` and checked above.
    await prisma.posTemplate.delete({ where: { id: templateId } });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** A blank `color` field means "no color" — the form field is never required. */
function parseColor(formData: FormData): PosCellColor | null {
  const raw = String(formData.get("color") ?? "").trim();
  if (!raw) {
    return null;
  }

  if (!Object.values(PosCellColor).includes(raw as PosCellColor)) {
    throw new Error("That color does not exist.");
  }

  return raw as PosCellColor;
}

/**
 * The tile a form describes: an article with a label, a price and a color, or
 * a spacer, which is a place in the stack and nothing else.
 */
async function cellFieldsFrom(formData: FormData) {
  if (String(formData.get("kind") ?? "") === PosCellKind.SPACER) {
    return { kind: PosCellKind.SPACER, elementId: null, label: "", price: "0.00", color: null };
  }

  const elementId = getRequiredString(formData, "elementId");
  const label = getRequiredString(formData, "label");
  const price = parsePrice(formData);
  const color = parseColor(formData);

  // The picker only offers real articles, but a stale tab is a real thing.
  const element = await prisma.stockElement.findUnique({ where: { id: elementId }, select: { id: true } });

  if (!element) {
    throw new Error("That article no longer exists.");
  }

  return { kind: PosCellKind.ARTICLE, elementId, label, price, color };
}

/** Every cell action addresses a tile by id and re-checks it is on that template. */
async function cellOnTemplate(cellId: string, templateId: string) {
  const cell = await prisma.posTemplateCell.findUnique({
    where: { id: cellId },
    select: { id: true, templateId: true, pageId: true, position: true },
  });

  if (!cell || cell.templateId !== templateId) {
    throw new Error("That tile no longer exists. Refresh and try again.");
  }

  return cell;
}

/** A page addressed by a form is re-checked to be on that template. */
async function pageOnTemplate(pageId: string, templateId: string) {
  const page = await prisma.posTemplatePage.findUnique({
    where: { id: pageId },
    select: { id: true, templateId: true },
  });

  if (!page || page.templateId !== templateId) {
    throw new Error("That page no longer exists. Refresh and try again.");
  }

  return page;
}

/** A blank title is no title — the page then reads "Page n". */
function parsePageTitle(formData: FormData): string | null {
  const title = String(formData.get("title") ?? "").trim();
  return title === "" ? null : title;
}

/** Adds a page after the last one. Pages are not reordered, so this is where it stays. */
export async function addPosTemplatePageAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");

    await templateInEdition(templateId, editionId);

    const position = await prisma.posTemplatePage.count({ where: { templateId } });

    await prisma.posTemplatePage.create({ data: { templateId, position, title: parsePageTitle(formData) } });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function renamePosTemplatePageAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");
    const pageId = getRequiredString(formData, "pageId");

    await templateInEdition(templateId, editionId);
    await pageOnTemplate(pageId, templateId);

    await prisma.posTemplatePage.update({ where: { id: pageId }, data: { title: parsePageTitle(formData) } });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Removes an empty page and closes the gap. Refused while it holds a tile —
 * deleting a page is never a quiet way of deleting what is on it — and refused
 * for the last page, because a template always has somewhere to add a tile.
 */
export async function removePosTemplatePageAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");
    const pageId = getRequiredString(formData, "pageId");

    await templateInEdition(templateId, editionId);
    await pageOnTemplate(pageId, templateId);

    const pageCount = await prisma.posTemplatePage.count({ where: { templateId } });
    if (pageCount <= 1) {
      throw new Error("A template keeps at least one page.");
    }

    const tileCount = await prisma.posTemplateCell.count({ where: { pageId } });
    if (tileCount > 0) {
      throw new Error("This page still has tiles. Move or remove them first.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.posTemplatePage.delete({ where: { id: pageId } });

      const remaining = await tx.posTemplatePage.findMany({
        where: { templateId },
        orderBy: { position: "asc" },
        select: { id: true },
      });

      await tx.posTemplatePage.updateMany({
        where: { templateId },
        data: { position: { increment: POSITION_PARK } },
      });
      for (const [position, page] of remaining.entries()) {
        await tx.posTemplatePage.update({ where: { id: page.id }, data: { position } });
      }
    });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** Appends a tile to the end of a page. Which screen of the page it lands on is the till's business. */
export async function addPosTemplateCellAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");

    const pageId = getRequiredString(formData, "pageId");

    await templateInEdition(templateId, editionId);
    await pageOnTemplate(pageId, templateId);

    const fields = await cellFieldsFrom(formData);
    const position = await prisma.posTemplateCell.count({ where: { pageId } });

    await prisma.posTemplateCell.create({ data: { templateId, pageId, position, ...fields } });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Edits one tile in place. It keeps its position — editing is not reordering —
 * unless the form names another page, and then it goes to the end of that one.
 */
export async function updatePosTemplateCellAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");
    const cellId = getRequiredString(formData, "cellId");

    const pageId = String(formData.get("pageId") ?? "").trim();

    await templateInEdition(templateId, editionId);
    const cell = await cellOnTemplate(cellId, templateId);

    const fields = await cellFieldsFrom(formData);

    if (pageId === "" || pageId === cell.pageId) {
      await prisma.posTemplateCell.update({ where: { id: cellId }, data: fields });
    } else {
      await pageOnTemplate(pageId, templateId);

      await prisma.$transaction(async (tx) => {
        await tx.posTemplateCell.update({ where: { id: cellId }, data: fields });

        const layout = (await storedLayout(tx, templateId)).map((page) => ({
          pageId: page.pageId,
          cellIds: page.cellIds.filter((id) => id !== cellId),
        }));
        layout.find((page) => page.pageId === pageId)?.cellIds.push(cellId);

        await renumber(tx, templateId, layout);
      });
    }

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Takes a tile out and closes the gap. The stack has no holes: a hole would
 * draw as a phantom tile on whatever page it fell on, and which page that is
 * changes with the device.
 */
export async function removePosTemplateCellAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");
    const cellId = getRequiredString(formData, "cellId");

    await templateInEdition(templateId, editionId);
    await cellOnTemplate(cellId, templateId);

    await prisma.$transaction(async (tx) => {
      await tx.posTemplateCell.delete({ where: { id: cellId } });
      await renumber(tx, templateId, await storedLayout(tx, templateId));
    });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Rewrites the whole layout — which page every tile is on, and in what order.
 * Called direct rather than through a form: dragging a tile is not a submit,
 * and the screen has already moved it — this is what makes the move survive a
 * refresh.
 *
 * The layout has to name exactly the template's pages, each once, and exactly
 * its tiles, each once. A partial list would leave the rest parked above
 * `POSITION_PARK`, which is a template whose tiles have silently jumped to the
 * end of a page.
 */
export async function reorderPosTemplateCellsAction(templateId: string, layout: PageLayout): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();

    await templateInEdition(templateId, editionId);

    const [pages, cells] = await Promise.all([
      prisma.posTemplatePage.findMany({ where: { templateId }, select: { id: true } }),
      prisma.posTemplateCell.findMany({ where: { templateId }, select: { id: true } }),
    ]);

    const knownPages = new Set(pages.map((page) => page.id));
    const givenPages = layout.map((page) => page.pageId);
    const knownCells = new Set(cells.map((cell) => cell.id));
    const givenCells = layout.flatMap((page) => page.cellIds);

    const sameSet = (given: string[], known: Set<string>) =>
      new Set(given).size === given.length && given.length === known.size && given.every((id) => known.has(id));

    if (!sameSet(givenPages, knownPages) || !sameSet(givenCells, knownCells)) {
      throw new Error("That order is out of date. Refresh and try again.");
    }

    await prisma.$transaction((tx) => renumber(tx, templateId, layout));

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
