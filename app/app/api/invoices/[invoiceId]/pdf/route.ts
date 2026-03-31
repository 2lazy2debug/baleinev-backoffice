import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import puppeteer from "puppeteer";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  ensureDefaultInvoiceTemplate,
  renderInvoiceTemplate,
  type InvoiceDocumentPayload,
} from "@/lib/document-templates";
import { buildSwissQrSvgDataUrl } from "@/lib/swiss-qr-image";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

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

export async function GET(_: Request, context: RouteContext) {
  try {
    await requireAdmin();

    const { invoiceId } = await context.params;
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        template: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const [logoDataUrl, defaultTemplate] = await Promise.all([
      getLogoDataUrl(),
      ensureDefaultInvoiceTemplate(),
    ]);

    const template = invoice.template ?? defaultTemplate;
    const qrImageDataUrl = await buildSwissQrSvgDataUrl(invoice.qrPayload);

    const rawItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    const lineItems = rawItems
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const row = item as Record<string, unknown>;
        const description = String(row.description ?? "").trim();
        const quantity = Number(row.quantity ?? 0);
        const unitPrice = Number(row.unitPrice ?? 0);

        if (!description || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
          return null;
        }

        return { description, quantity, unitPrice };
      })
      .filter((item): item is { description: string; quantity: number; unitPrice: number } => item !== null);

    const payload: InvoiceDocumentPayload = {
      creditorName: invoice.creditorName,
      creditorAddress: invoice.creditorAddress,
      creditorPostalCode: invoice.creditorPostalCode,
      creditorCity: invoice.creditorCity,
      creditorCountry: invoice.creditorCountry,
      bankAccountName: invoice.bankAccountName,
      iban: invoice.iban,
      supplierName: invoice.supplierName,
      supplierAddress: invoice.supplierAddress,
      supplierPostalCode: invoice.supplierPostalCode,
      supplierCity: invoice.supplierCity,
      supplierCountry: invoice.supplierCountry,
      invoiceNumber: invoice.invoiceNumber,
      header: invoice.header ?? "",
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "",
      paymentReference: invoice.paymentReference ?? "",
      message: invoice.message ?? "",
      totalAmount: Number(invoice.totalAmount),
      lineItems,
      qrPayload: invoice.qrPayload,
      qrImageDataUrl,
      logoDataUrl,
    };

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

      const safeFileName = (invoice.invoiceNumber || "invoice")
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
      { error: error instanceof Error ? error.message : "Failed to generate invoice PDF." },
      { status: 400 },
    );
  }
}
