import { readFile } from "node:fs/promises";
import path from "node:path";

import { DocumentType } from "@prisma/client";
import { NextResponse } from "next/server";
import puppeteer from "puppeteer";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  ensureDefaultInvoiceTemplate,
  renderInvoiceTemplate,
  type InvoiceDocumentLineItem,
  type InvoiceDocumentPayload,
} from "@/lib/document-templates";
import { buildSwissQrSvgDataUrl } from "@/lib/swiss-qr-image";

function getRequiredString(value: unknown, key: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function getRequiredNumber(value: unknown, key: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be a valid positive number.`);
  }

  return value;
}

function getLineItems(value: unknown): InvoiceDocumentLineItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("lineItems is required.");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`lineItems[${index}] is invalid.`);
    }

    const description = getRequiredString((item as Record<string, unknown>).description, `lineItems[${index}].description`);
    const quantity = getRequiredNumber((item as Record<string, unknown>).quantity, `lineItems[${index}].quantity`);
    const unitPrice = getRequiredNumber((item as Record<string, unknown>).unitPrice, `lineItems[${index}].unitPrice`);

    return {
      description,
      quantity,
      unitPrice,
    };
  });
}

function toDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function getLogoDataUrl() {
  const candidatePaths = [
    path.resolve(process.cwd(), "..", "soa", "qr", "blv-logo-noir-render.png"),
    path.resolve(process.cwd(), "public", "logo_blv.png"),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const file = await readFile(candidatePath);
      return toDataUrl(file, "image/png");
    } catch {
      // try next path
    }
  }

  throw new Error("Could not load invoice logo asset.");
}

function buildInvoicePayload(body: Record<string, unknown>, qrImageDataUrl: string, logoDataUrl: string): InvoiceDocumentPayload {
  return {
    creditorName: getRequiredString(body.creditorName, "creditorName"),
    creditorAddress: getRequiredString(body.creditorAddress, "creditorAddress"),
    creditorPostalCode: getRequiredString(body.creditorPostalCode, "creditorPostalCode"),
    creditorCity: getRequiredString(body.creditorCity, "creditorCity"),
    creditorCountry: getRequiredString(body.creditorCountry, "creditorCountry"),
    bankAccountName: getRequiredString(body.bankAccountName, "bankAccountName"),
    iban: getRequiredString(body.iban, "iban"),
    supplierName: getRequiredString(body.supplierName, "supplierName"),
    supplierAddress: getRequiredString(body.supplierAddress, "supplierAddress"),
    supplierPostalCode: getRequiredString(body.supplierPostalCode, "supplierPostalCode"),
    supplierCity: getRequiredString(body.supplierCity, "supplierCity"),
    supplierCountry: typeof body.supplierCountry === "string" && body.supplierCountry.trim() ? body.supplierCountry.trim() : "CH",
    invoiceNumber: typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "",
    header: typeof body.header === "string" ? body.header.trim() : "",
    invoiceDate: getRequiredString(body.invoiceDate, "invoiceDate"),
    dueDate: typeof body.dueDate === "string" ? body.dueDate.trim() : "",
    paymentReference: typeof body.paymentReference === "string" ? body.paymentReference.trim() : "",
    message: typeof body.message === "string" ? body.message.trim() : "",
    totalAmount: getRequiredNumber(body.totalAmount, "totalAmount"),
    lineItems: getLineItems(body.lineItems),
    qrPayload: getRequiredString(body.qrPayload, "qrPayload"),
    qrImageDataUrl,
    logoDataUrl,
  };
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json() as Record<string, unknown>;
    const templateId = typeof body.templateId === "string" ? body.templateId : null;

    const [logoDataUrl, defaultTemplate] = await Promise.all([
      getLogoDataUrl(),
      ensureDefaultInvoiceTemplate(),
    ]);

    const template = templateId
      ? await prisma.documentTemplate.findFirst({
        where: { id: templateId, documentType: DocumentType.INVOICE },
      })
      : defaultTemplate;

    if (!template) {
      throw new Error("No invoice template available.");
    }

    const qrPayload = getRequiredString(body.qrPayload, "qrPayload");
    const qrImageDataUrl = await buildSwissQrSvgDataUrl(qrPayload);

    const payload = buildInvoicePayload(body, qrImageDataUrl, logoDataUrl);
    const html = renderInvoiceTemplate(template.html, payload);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "0mm",
          right: "0mm",
          bottom: "0mm",
          left: "0mm",
        },
      });

      const safeFileName = (payload.invoiceNumber || "invoice")
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "invoice";

      return new Response(Uint8Array.from(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeFileName}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate document." },
      { status: 400 },
    );
  }
}
