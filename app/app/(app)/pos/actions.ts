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
 * A template is an **ordered stack** of tiles, not a grid of slots: a tile is
 * added at the end, edited by its own id, and removed by closing the gap it
 * leaves. `position` is a dense 0-based index and stays dense — a hole in the
 * order would draw as a phantom tile on whatever page it happened to land on.
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

/** Rewrites a template's positions to 0..n-1 in the order the ids are given. */
async function renumber(tx: Prisma.TransactionClient, templateId: string, orderedIds: string[]) {
  await tx.posTemplateCell.updateMany({
    where: { templateId },
    data: { position: { increment: POSITION_PARK } },
  });

  for (const [position, id] of orderedIds.entries()) {
    await tx.posTemplateCell.update({ where: { id }, data: { position } });
  }
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

    await prisma.posTemplate.create({ data: { editionId, name } });

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
    select: { id: true, templateId: true, position: true },
  });

  if (!cell || cell.templateId !== templateId) {
    throw new Error("That tile no longer exists. Refresh and try again.");
  }

  return cell;
}

/** Appends a tile to the end of the stack. Where it lands on a page is the till's business. */
export async function addPosTemplateCellAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");

    await templateInEdition(templateId, editionId);

    const fields = await cellFieldsFrom(formData);
    const position = await prisma.posTemplateCell.count({ where: { templateId } });

    await prisma.posTemplateCell.create({ data: { templateId, position, ...fields } });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** Edits one tile in place. It keeps its position — editing is not reordering. */
export async function updatePosTemplateCellAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");
    const cellId = getRequiredString(formData, "cellId");

    await templateInEdition(templateId, editionId);
    await cellOnTemplate(cellId, templateId);

    const fields = await cellFieldsFrom(formData);

    await prisma.posTemplateCell.update({ where: { id: cellId }, data: fields });

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

      const remaining = await tx.posTemplateCell.findMany({
        where: { templateId },
        orderBy: { position: "asc" },
        select: { id: true },
      });

      await renumber(tx, templateId, remaining.map((cell) => cell.id));
    });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Rewrites the whole order. Called direct rather than through a form: dragging
 * a tile is not a submit, and the screen has already moved it — this is what
 * makes the move survive a refresh.
 *
 * `cellIds` has to be exactly the template's tiles, every one of them once. A
 * partial list would leave the rest parked above `POSITION_PARK`, which is a
 * template whose tiles have silently jumped to the end.
 */
export async function reorderPosTemplateCellsAction(templateId: string, cellIds: string[]): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();

    await templateInEdition(templateId, editionId);

    const cells = await prisma.posTemplateCell.findMany({ where: { templateId }, select: { id: true } });
    const known = new Set(cells.map((cell) => cell.id));
    const given = new Set(cellIds);

    if (given.size !== cellIds.length || given.size !== known.size || cellIds.some((id) => !known.has(id))) {
      throw new Error("That order is out of date. Refresh and try again.");
    }

    await prisma.$transaction((tx) => renumber(tx, templateId, cellIds));

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
