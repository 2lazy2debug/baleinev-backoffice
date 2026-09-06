"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { assertBarcodeFree, elementFieldsFrom } from "@/lib/articles";
import { prisma } from "@/lib/db";
import { type ActionState, getRequiredString, toActionErrorMessage } from "@/lib/server-action-helpers";

/**
 * The catalogue's own writes. The articles app is admin-only, so every action
 * here starts with `requireAdmin()` — the scan-to-create path in the stock app
 * is the one way a non-admin adds a `StockElement`, and it lives in
 * `stock/actions.ts`.
 *
 * `StockElement` is edition-independent, like stock: nothing here resolves an
 * edition and a closed one does not make the catalogue read-only.
 */

/** Every screen that reads the catalogue or the stock built on it. */
function revalidateArticles() {
  revalidatePath("/articles");
  revalidatePath("/stock");
}

export async function createArticleAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const data = elementFieldsFrom(formData);
    await assertBarcodeFree(prisma, data.barcode);
    await prisma.stockElement.create({ data });

    revalidateArticles();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Editing an article that has already been stocked is allowed on every field but
 * one: turning off `expireable` would leave dated rows behind that nothing draws
 * a date for, so that switch is refused while any of them exist.
 */
export async function updateArticleAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const elementId = getRequiredString(formData, "elementId");
    const data = elementFieldsFrom(formData);

    await assertBarcodeFree(prisma, data.barcode, elementId);

    if (!data.expireable) {
      const dated = await prisma.stockItem.count({ where: { elementId, expireDate: { not: null } } });

      if (dated > 0) {
        throw new Error("This item is in stock with an expiry date. Take those entries out before turning expiry off.");
      }
    }

    if (!data.tracksStock) {
      const stocked = await prisma.stockItem.count({ where: { elementId } });

      if (stocked > 0) {
        throw new Error("This article is in a stock. Take it out of every stock before turning stock tracking off.");
      }
    }

    await prisma.stockElement.update({ where: { id: elementId }, data });

    revalidateArticles();
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteArticleAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    const elementId = getRequiredString(formData, "elementId");
    const stocked = await prisma.stockItem.count({ where: { elementId } });

    if (stocked > 0) {
      throw new Error("This item is in a stock. Take it out of every stock before deleting it.");
    }

    // A POS template cell is `Restrict` on `elementId` — without this check the
    // foreign key throws a raw Prisma error at the user instead.
    const onTemplates = await prisma.posTemplateCell.count({ where: { elementId } });

    if (onTemplates > 0) {
      throw new Error("This article is on a POS template. Remove it from every template before deleting it.");
    }

    // Its movements go with it: they describe an item that no longer exists,
    // and there is nothing left for the history to name them by.
    await prisma.stockElement.delete({ where: { id: elementId } });

    revalidateArticles();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
