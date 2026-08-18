import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { requireWritableEdition } from "@/lib/edition-context";

function getRequiredString(body: Record<string, unknown>, key: string) {
  const value = String(body[key] ?? "").trim();
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function getOptionalDate(body: Record<string, unknown>, key: string) {
  const value = String(body[key] ?? "").trim();
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${key} is invalid.`);
  }

  return date;
}

function getRequiredDate(body: Record<string, unknown>, key: string) {
  const value = getRequiredString(body, key);
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${key} is invalid.`);
  }
  return date;
}

function getLineItems(body: Record<string, unknown>) {
  const value = body.lineItems;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("lineItems is required.");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`lineItems[${index}] is invalid.`);
    }

    const row = item as Record<string, unknown>;
    const description = String(row.description ?? "").trim();
    const quantity = typeof row.quantity === "number" ? row.quantity : Number.NaN;
    const unitPrice = typeof row.unitPrice === "number" ? row.unitPrice : Number.NaN;

    if (!description) {
      throw new Error(`lineItems[${index}].description is required.`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`lineItems[${index}] has invalid values.`);
    }

    return {
      description,
      quantity,
      unitPrice,
    };
  });
}

function computeTotal(lineItems: { quantity: number; unitPrice: number }[]) {
  const total = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  // Round to cents so the stored total matches the printed line-item sum.
  return Math.round(total * 100) / 100;
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Record<string, unknown>;

    const invoiceNumber = getRequiredString(body, "invoiceNumber");
    const editionId = getRequiredString(body, "editionId");
    const lineItems = getLineItems(body);

    // This route names its own edition rather than the caller's, so the
    // read-only guard has to run against the body value.
    await requireWritableEdition(editionId);

    const created = await prisma.invoice.create({
      data: {
        editionId,
        moneyAccountId: getRequiredString(body, "moneyAccountId"),
        templateId: String(body.templateId ?? "").trim() || null,
        invoiceNumber,
        header: String(body.header ?? "").trim() || null,
        invoiceDate: getRequiredDate(body, "invoiceDate"),
        dueDate: getOptionalDate(body, "dueDate"),
        supplierName: getRequiredString(body, "supplierName"),
        supplierAddress: getRequiredString(body, "supplierAddress"),
        supplierPostalCode: getRequiredString(body, "supplierPostalCode"),
        supplierCity: getRequiredString(body, "supplierCity"),
        supplierCountry: String(body.supplierCountry ?? "CH").trim() || "CH",
        creditorName: getRequiredString(body, "creditorName"),
        creditorAddress: getRequiredString(body, "creditorAddress"),
        creditorPostalCode: getRequiredString(body, "creditorPostalCode"),
        creditorCity: getRequiredString(body, "creditorCity"),
        creditorCountry: String(body.creditorCountry ?? "CH").trim() || "CH",
        bankAccountName: getRequiredString(body, "bankAccountName"),
        iban: getRequiredString(body, "iban"),
        paymentReference: String(body.paymentReference ?? "").trim() || null,
        message: String(body.message ?? "").trim() || null,
        totalAmount: computeTotal(lineItems),
        lineItems,
        qrPayload: getRequiredString(body, "qrPayload"),
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An invoice with this number already exists for the active edition." }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save invoice." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const invoiceId = getRequiredString(body, "invoiceId");
    const status = getRequiredString(body, "status");

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        editionId: true,
        linkedJournalEntryId: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    await requireWritableEdition(invoice.editionId);

    if (status === "PAID") {
      const journalEntryId = getRequiredString(body, "journalEntryId");
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { id: journalEntryId },
        select: {
          id: true,
          editionId: true,
          accountType: true,
          isOpeningEntry: true,
        },
      });

      if (!journalEntry) {
        return NextResponse.json({ error: "Journal entry not found." }, { status: 404 });
      }

      if (journalEntry.editionId !== invoice.editionId) {
        return NextResponse.json({ error: "Journal entry must belong to the same edition." }, { status: 400 });
      }

      if (journalEntry.accountType !== "PRODUITS" || journalEntry.isOpeningEntry) {
        return NextResponse.json({ error: "Only non-opening earning entries can be linked." }, { status: 400 });
      }

      const updated = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          linkedJournalEntryId: journalEntry.id,
          paidAt: new Date(),
        },
        select: {
          id: true,
          linkedJournalEntryId: true,
          paidAt: true,
        },
      });

      return NextResponse.json(updated);
    }

    if (status === "UNPAID") {
      const updated = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          linkedJournalEntryId: null,
          paidAt: null,
        },
        select: {
          id: true,
          linkedJournalEntryId: true,
          paidAt: true,
        },
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This journal entry is already linked to another invoice." }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update invoice status." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Record<string, unknown>;

    const invoiceId = getRequiredString(body, "invoiceId");
    const invoiceNumber = getRequiredString(body, "invoiceNumber");
    const existing = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        editionId: true,
        invoiceNumber: true,
        paidAt: true,
        linkedJournalEntryId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    await requireWritableEdition(existing.editionId);

    if (existing.invoiceNumber !== invoiceNumber) {
      return NextResponse.json({ error: "Invoice number cannot be changed for an existing invoice." }, { status: 400 });
    }

    if (existing.paidAt || existing.linkedJournalEntryId) {
      return NextResponse.json({ error: "Paid invoices cannot be edited." }, { status: 409 });
    }

    const lineItems = getLineItems(body);

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        moneyAccountId: getRequiredString(body, "moneyAccountId"),
        templateId: String(body.templateId ?? "").trim() || null,
        header: String(body.header ?? "").trim() || null,
        invoiceDate: getRequiredDate(body, "invoiceDate"),
        dueDate: getOptionalDate(body, "dueDate"),
        supplierName: getRequiredString(body, "supplierName"),
        supplierAddress: getRequiredString(body, "supplierAddress"),
        supplierPostalCode: getRequiredString(body, "supplierPostalCode"),
        supplierCity: getRequiredString(body, "supplierCity"),
        supplierCountry: String(body.supplierCountry ?? "CH").trim() || "CH",
        creditorName: getRequiredString(body, "creditorName"),
        creditorAddress: getRequiredString(body, "creditorAddress"),
        creditorPostalCode: getRequiredString(body, "creditorPostalCode"),
        creditorCity: getRequiredString(body, "creditorCity"),
        creditorCountry: String(body.creditorCountry ?? "CH").trim() || "CH",
        bankAccountName: getRequiredString(body, "bankAccountName"),
        iban: getRequiredString(body, "iban"),
        paymentReference: String(body.paymentReference ?? "").trim() || null,
        message: String(body.message ?? "").trim() || null,
        totalAmount: computeTotal(lineItems),
        lineItems,
        qrPayload: getRequiredString(body, "qrPayload"),
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json({ id: updated.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update invoice." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get("id")?.trim() ?? "";

    if (!invoiceId) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        editionId: true,
        linkedJournalEntryId: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    await requireWritableEdition(invoice.editionId);

    if (invoice.linkedJournalEntryId) {
      return NextResponse.json({ error: "Paid invoices cannot be deleted. Set as unpaid first." }, { status: 409 });
    }

    await prisma.invoice.delete({ where: { id: invoice.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete invoice." },
      { status: 400 },
    );
  }
}
