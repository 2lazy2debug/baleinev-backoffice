"use server";

import { DocumentOutputFormat, DocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { type ActionState, getRequiredString, toActionErrorMessage } from "@/lib/server-action-helpers";

function parseDocumentType(formData: FormData) {
  const documentType = getRequiredString(formData, "documentType") as DocumentType;

  if (documentType !== DocumentType.INVOICE) {
    throw new Error("Invalid document type.");
  }

  return documentType;
}

export async function createDocumentTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    const name = getRequiredString(formData, "name");
    const documentType = parseDocumentType(formData);
    const html = getRequiredString(formData, "html");

    const existingCount = await prisma.documentTemplate.count({ where: { documentType } });

    await prisma.documentTemplate.create({
      data: {
        name,
        documentType,
        outputFormat: DocumentOutputFormat.PDF,
        html,
        isDefault: existingCount === 0,
      },
    });

    revalidatePath("/templates");
    revalidatePath("/invoices");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateDocumentTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    const templateId = getRequiredString(formData, "templateId");
    const name = getRequiredString(formData, "name");
    const html = getRequiredString(formData, "html");

    await prisma.documentTemplate.update({
      where: { id: templateId },
      data: {
        name,
        html,
      },
    });

    revalidatePath("/templates");
    revalidatePath("/invoices");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function makeDocumentTemplateDefaultAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    const templateId = getRequiredString(formData, "templateId");
    const template = await prisma.documentTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, documentType: true },
    });

    if (!template) {
      throw new Error("Template not found.");
    }

    await prisma.$transaction([
      prisma.documentTemplate.updateMany({
        where: { documentType: template.documentType },
        data: { isDefault: false },
      }),
      prisma.documentTemplate.update({
        where: { id: template.id },
        data: { isDefault: true },
      }),
    ]);

    revalidatePath("/templates");
    revalidatePath("/invoices");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteDocumentTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    const templateId = getRequiredString(formData, "templateId");
    const template = await prisma.documentTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, documentType: true, isDefault: true },
    });

    if (!template) {
      throw new Error("Template not found.");
    }

    if (template.isDefault) {
      throw new Error("Select another default template before deleting this one.");
    }

    await prisma.documentTemplate.delete({ where: { id: templateId } });

    revalidatePath("/templates");
    revalidatePath("/invoices");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
