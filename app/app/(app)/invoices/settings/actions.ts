"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { INVOICE_SETTINGS_ID } from "@/lib/invoice-template";
import { type ActionState, getRequiredString, toActionErrorMessage } from "@/lib/server-action-helpers";

/** Replaces the HTML layout every invoice PDF renders with. */
export async function updateInvoiceTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    const templateHtml = getRequiredString(formData, "templateHtml");

    await prisma.invoiceSettings.upsert({
      where: { id: INVOICE_SETTINGS_ID },
      update: { templateHtml },
      create: { id: INVOICE_SETTINGS_ID, templateHtml },
    });

    revalidatePath("/invoices/settings");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
