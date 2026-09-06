"use server";

import { revalidatePath } from "next/cache";

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
 * `setPosTemplateCellAction` is an upsert on `@@unique([templateId, position])`:
 * the same call fills an empty slot and edits a filled one, so the editor has
 * one dialog and one code path.
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

function parsePosition(formData: FormData): number {
  const position = Number(String(formData.get("position") ?? "").trim());

  if (!Number.isInteger(position) || position < 0) {
    throw new Error("That slot is not valid.");
  }

  return position;
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

    // The cells cascade. In 103 nothing else points at a template.
    await prisma.posTemplate.delete({ where: { id: templateId } });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function setPosTemplateCellAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");

    await templateInEdition(templateId, editionId);

    const position = parsePosition(formData);
    const elementId = getRequiredString(formData, "elementId");
    const label = getRequiredString(formData, "label");
    const price = parsePrice(formData);

    // The picker only offers real articles, but a stale tab is a real thing.
    const element = await prisma.stockElement.findUnique({ where: { id: elementId }, select: { id: true } });

    if (!element) {
      throw new Error("That article no longer exists.");
    }

    await prisma.posTemplateCell.upsert({
      where: { templateId_position: { templateId, position } },
      create: { templateId, position, elementId, label, price },
      update: { elementId, label, price },
    });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function clearPosTemplateCellAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const templateId = getRequiredString(formData, "templateId");

    await templateInEdition(templateId, editionId);

    const position = parsePosition(formData);

    // `deleteMany` so clearing an already-empty slot is a no-op, not a throw.
    await prisma.posTemplateCell.deleteMany({ where: { templateId, position } });

    revalidateTemplate(templateId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
