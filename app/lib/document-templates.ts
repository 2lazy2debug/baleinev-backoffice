import { DocumentOutputFormat, DocumentType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";

export type InvoiceDocumentLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceDocumentPayload = {
  creditorName: string;
  creditorAddress: string;
  creditorPostalCode: string;
  creditorCity: string;
  creditorCountry: string;
  bankAccountName: string;
  iban: string;
  supplierName: string;
  supplierAddress: string;
  supplierPostalCode: string;
  supplierCity: string;
  supplierCountry: string;
  invoiceNumber: string;
  header: string;
  invoiceDate: string;
  dueDate: string;
  paymentReference: string;
  message: string;
  totalAmount: number;
  lineItems: InvoiceDocumentLineItem[];
  qrPayload: string;
  qrImageDataUrl: string;
  logoDataUrl: string;
};

export const invoiceTemplatePlaceholders = [
  "[[invoiceNumber]]",
  "[[invoiceDate]]",
  "[[dueDate]]",
  "[[totalAmountNumber]]",
  "[[header]]",
  "[[creditorName]]",
  "[[creditorAddress]]",
  "[[cityDateLine]]",
  "[[creditorPostalCode]]",
  "[[creditorCity]]",
  "[[creditorCountry]]",
  "[[bankAccountName]]",
  "[[iban]]",
  "[[supplierName]]",
  "[[supplierAddress]]",
  "[[supplierPostalCode]]",
  "[[supplierCity]]",
  "[[supplierCountry]]",
  "[[paymentReference]]",
  "[[message]]",
  "[[totalAmount]]",
  "[[lineItemsRows]]",
  "[[qrImageDataUrl]]",
  "[[logoDataUrl]]",
];

export const defaultInvoiceTemplateHtml = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>Facture [[invoiceNumber]]</title>
    <style>
      @page {
        size: A4;
        margin: 0;
      }

      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11pt;
        color: #111111;
        background: #ffffff;
      }

      .page {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        position: relative;
        background: #ffffff;
      }

      .page-1 {
        padding: 13mm 13mm 10mm;
      }

      .top {
        margin: 0;
      }

      .logo-wrap {
        margin: 0 0 6mm;
      }

      .logo {
        display: block;
        width: 58mm;
        height: auto;
        margin: 0;
      }

      .address-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .address-table td {
        border: 0;
        padding: 0;
        vertical-align: top;
      }

      .address-left {
        width: 59%;
        padding-right: 8mm;
      }

      .address-right {
        width: 41%;
      }

      .sender {
        font-size: 11pt;
        line-height: 1.35;
      }

      .sender strong {
        font-weight: 700;
      }

      .recipient {
        font-size: 11pt;
        line-height: 1.35;
        font-weight: 700;
      }

      .meta-row {
        margin-top: 11mm;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }

      .contact {
        font-size: 10pt;
        line-height: 1.35;
      }

      .contact a {
        color: #0563c1;
        text-decoration: underline;
      }

      .city-date {
        font-size: 10pt;
        text-align: right;
      }

      .title {
        margin: 10mm 0 0;
        font-size: 12pt;
        font-weight: 700;
      }

      .subject {
        margin: 1.5mm 0 2mm;
        font-size: 11pt;
        font-weight: 700;
      }

      .rule {
        border: 0;
        border-top: 0.7px solid #000;
        margin: 0;
      }

      .lead {
        margin: 8mm 0 0;
        font-size: 10pt;
        line-height: 1.45;
      }

      .lead + .lead {
        margin-top: 4.5mm;
      }

      .line-items {
        width: 100%;
        border-collapse: collapse;
        margin-top: 6mm;
        font-size: 10pt;
      }

      .line-items th,
      .line-items td {
        padding: 2.2mm 2.6mm;
        border: 0.7px solid #111;
        vertical-align: top;
      }

      .line-items th {
        font-weight: 700;
        text-align: left;
        background: #fff;
      }

      .line-items .number {
        text-align: right;
        white-space: nowrap;
      }

      .line-items .blank td {
        height: 7mm;
      }

      .total-row td {
        font-weight: 700;
      }

      .closing {
        margin-top: 6mm;
        font-size: 10pt;
        line-height: 1.45;
      }

      .signature {
        margin-top: 6mm;
        display: grid;
        grid-template-columns: 1fr 66mm;
      }

      .signature-box {
        font-size: 10pt;
        line-height: 1.45;
      }

      .due {
        margin-top: 8mm;
        font-size: 11pt;
        font-weight: 700;
      }

      .annex {
        margin-top: 6mm;
        font-size: 11pt;
        font-style: italic;
        font-weight: 700;
      }

      .page-2 {
        page-break-before: always;
        font-family: "Frutiger", "Helvetica Neue", Arial, Helvetica, sans-serif;
      }

      .qr-bill {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 105mm;
        border-top: 1px dashed #000;
        display: grid;
        grid-template-columns: 62mm 148mm;
      }

      .qr-receipt {
        border-right: 1px dashed #000;
        padding: 9mm 5mm 6mm 12mm;
        line-height: 1.125;
      }

      .qr-payment {
        padding: 9mm 8mm 6mm 8mm;
        line-height: 1.1;
      }

      .qr-title {
        margin: 0 0 3.2mm;
        font-size: 11pt;
        font-weight: 700;
      }

      .qr-label-r {
        font-size: 6pt;
        font-weight: 700;
        line-height: 1.1;
      }

      .qr-value-r {
        margin-top: 0.8mm;
        font-size: 8pt;
        line-height: 1.125;
      }

      .qr-label-p {
        font-size: 8pt;
        font-weight: 700;
        line-height: 1.1;
      }

      .qr-value-p {
        margin-top: 0.8mm;
        font-size: 10pt;
        line-height: 1.1;
      }

      .qr-grid {
        margin-top: 2.8mm;
        display: grid;
        grid-template-columns: 50mm 1fr;
        gap: 4.5mm;
      }

      .qr-code-wrap {
        width: 46mm;
        height: 46mm;
      }

      .qr-code {
        width: 46mm;
        height: 46mm;
        object-fit: contain;
      }

      .qr-bottom {
        margin-top: 4.8mm;
        display: grid;
        grid-template-columns: auto auto;
        gap: 8mm;
        width: fit-content;
      }

      .qr-currency,
      .qr-amount {
        white-space: nowrap;
      }

      .qr-currency-r,
      .qr-amount-r {
        font-size: 8pt;
      }

      .qr-currency-p,
      .qr-amount-p {
        font-size: 10pt;
      }

      .qr-currency-r .qr-label-r,
      .qr-amount-r .qr-label-r,
      .qr-currency-p .qr-label-p,
      .qr-amount-p .qr-label-p {
        display: block;
        margin-bottom: 0.5mm;
      }

      .qr-deposit {
        margin-top: 10mm;
        text-align: right;
      }

      .cut-marker {
        position: absolute;
        top: -2.5mm;
        width: 6mm;
        text-align: center;
        font-size: 8mm;
        line-height: 1;
        font-weight: 700;
      }

      .cut-marker.left {
        left: 5mm;
      }

      .cut-marker.center {
        left: 61mm;
      }
    </style>
  </head>
  <body>
    <div class="page page-1">
      <div class="top">
        <div class="logo-wrap">
          <img class="logo" src="[[logoDataUrl]]" alt="Baleinev" />
        </div>

        <table class="address-table" role="presentation" aria-hidden="true">
          <tr>
            <td class="address-left">
              <div class="sender">
                <div><strong>[[creditorName]]</strong></div>
                <div>[[creditorAddress]]</div>
                <div>[[creditorPostalCode]] [[creditorCity]]</div>
              </div>
            </td>
            <td class="address-right">
              <div class="recipient">
                <div>À l'attention de [[supplierName]]</div>
                <div>[[supplierAddress]]</div>
                <div>[[supplierPostalCode]] [[supplierCity]]</div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <div class="meta-row">
        <div class="contact">
          <div>Manuel Cabras - Responsable comptabilité</div>
          <div><a href="mailto:compta@baleinev.ch">compta@baleinev.ch</a></div>
          <div>+41 79 856 74 82</div>
        </div>
        <div class="city-date">[[cityDateLine]]</div>
      </div>

      <h1 class="title">Facture n° [[invoiceNumber]]</h1>
      <div class="subject">[[header]]</div>
      <hr class="rule" />

      <p class="lead">Le Baleinev festival vous remercie chaleureusement pour votre soutien envers l'association.</p>
      <p class="lead">Veuillez trouver, ci-dessous, le montant facturé relatif à la prestation facturée pour l'édition en cours :</p>

      <table class="line-items">
        <thead>
          <tr>
            <th>Libellé</th>
            <th class="number">Qté</th>
            <th class="number">Montant</th>
          </tr>
        </thead>
        <tbody>
          [[lineItemsRows]]
          <tr class="total-row">
            <td>Montant TOTAL TTC :</td>
            <td></td>
            <td class="number">[[totalAmount]]</td>
          </tr>
        </tbody>
      </table>

      <div class="closing">En vous remerciant de votre confiance,<br />Nous vous prions d'agréer nos salutations les meilleures.</div>

      <div class="signature">
        <div></div>
        <div class="signature-box">
          <div>Manuel Cabras</div>
          <div>Responsable Comptabilité</div>
          <div>Association Baleinev</div>
        </div>
      </div>

      <div class="due">Échéance : [[dueDate]]</div>
      <div class="annex">Annexe : bulletin de versement digital</div>
    </div>

    <div class="page page-2">
      <div class="qr-bill">
        <div class="cut-marker left">✂</div>
        <div class="cut-marker center">✂</div>

        <section class="qr-receipt">
          <h2 class="qr-title">Récépissé</h2>

          <div class="qr-label-r">Compte / Payable à</div>
          <div class="qr-value-r">[[iban]]<br />[[creditorName]]<br />[[creditorAddress]]<br />[[creditorPostalCode]] [[creditorCity]]</div>

          <div class="qr-label-r" style="margin-top: 4mm;">Payable par</div>
          <div class="qr-value-r">[[supplierName]]<br />[[supplierAddress]]<br />[[supplierPostalCode]] [[supplierCity]]</div>

          <div class="qr-bottom">
            <div class="qr-currency-r">
              <span class="qr-label-r">Monnaie</span>
              CHF
            </div>
            <div class="qr-amount-r">
              <span class="qr-label-r">Montant</span>
              [[totalAmountNumber]]
            </div>
          </div>

          <div class="qr-deposit qr-label-r">Point de dépôt</div>
        </section>

        <section class="qr-payment">
          <h2 class="qr-title">Section paiement</h2>

          <div class="qr-grid">
            <div class="qr-code-wrap">
              <img class="qr-code" src="[[qrImageDataUrl]]" alt="Swiss QR" />
            </div>

            <div>
              <div class="qr-label-p">Compte / Payable à</div>
              <div class="qr-value-p">[[iban]]<br />[[creditorName]]<br />[[creditorAddress]]<br />[[creditorPostalCode]] [[creditorCity]]</div>

              <div class="qr-label-p" style="margin-top: 3.6mm;">Informations supplémentaires</div>
              <div class="qr-value-p">[[message]]</div>

              <div class="qr-label-p" style="margin-top: 3.6mm;">Payable par</div>
              <div class="qr-value-p">[[supplierName]]<br />[[supplierAddress]]<br />[[supplierPostalCode]] [[supplierCity]]</div>
            </div>
          </div>

          <div class="qr-bottom">
            <div class="qr-currency-p">
              <span class="qr-label-p">Monnaie</span>
              CHF
            </div>
            <div class="qr-amount-p">
              <span class="qr-label-p">Montant</span>
              [[totalAmountNumber]]
            </div>
          </div>
        </section>
      </div>
    </div>
  </body>
</html>`;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMultilineHtml(value: string) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => escapeHtml(line.trim()))
    .filter((line) => line.length > 0)
    .join("<br />");
}

function formatDisplayDate(value: string) {
  if (!value) {
    return "-";
  }

  const normalized = String(value).trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}.${month}.${year}`;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function buildLineItemsRows(lineItems: InvoiceDocumentLineItem[]) {
  return lineItems
    .map((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      return `<tr>
        <td>${escapeHtml(item.description || "-")}</td>
        <td class="number">${escapeHtml(String(item.quantity))}</td>
        <td class="number">${escapeHtml(`${lineTotal.toFixed(2)} CHF`)}</td>
      </tr>`;
    })
    .join("\n");
}

export function renderTemplateHtml(templateHtml: string, fields: Record<string, string>) {
  return templateHtml.replace(/\[\[([a-zA-Z0-9]+)\]\]/g, (_match, rawKey: string) => fields[rawKey] ?? "");
}

export function buildInvoiceTemplateFields(payload: InvoiceDocumentPayload) {
  const cityDateLine = `${payload.creditorCity}, le ${formatDisplayDate(payload.invoiceDate)}`;
  const totalAmountNumber = payload.totalAmount.toFixed(2);

  return {
    invoiceNumber: escapeHtml(payload.invoiceNumber || "-"),
    invoiceDate: escapeHtml(formatDisplayDate(payload.invoiceDate)),
    dueDate: escapeHtml(formatDisplayDate(payload.dueDate)),
    header: escapeHtml(payload.header || "Objet de la facture"),
    creditorName: escapeHtml(payload.creditorName),
    creditorAddress: escapeHtml(payload.creditorAddress),
    creditorPostalCode: escapeHtml(payload.creditorPostalCode),
    creditorCity: escapeHtml(payload.creditorCity),
    creditorCountry: escapeHtml(payload.creditorCountry),
    bankAccountName: escapeHtml(payload.bankAccountName),
    iban: escapeHtml(payload.iban),
    supplierName: escapeMultilineHtml(payload.supplierName),
    supplierAddress: escapeHtml(payload.supplierAddress),
    supplierPostalCode: escapeHtml(payload.supplierPostalCode),
    supplierCity: escapeHtml(payload.supplierCity),
    supplierCountry: escapeHtml(payload.supplierCountry),
    paymentReference: escapeHtml(payload.paymentReference || "-"),
    message: escapeHtml(payload.message || payload.header || "-"),
    totalAmount: escapeHtml(formatCurrency(payload.totalAmount)),
    totalAmountNumber: escapeHtml(totalAmountNumber),
    lineItemsRows: buildLineItemsRows(payload.lineItems),
    qrImageDataUrl: escapeHtml(payload.qrImageDataUrl),
    logoDataUrl: escapeHtml(payload.logoDataUrl),
    cityDateLine: escapeHtml(cityDateLine),
  };
}

export function renderInvoiceTemplate(templateHtml: string, payload: InvoiceDocumentPayload) {
  return renderTemplateHtml(templateHtml, buildInvoiceTemplateFields(payload));
}

export async function ensureDefaultInvoiceTemplate() {
  const existingDefault = await prisma.documentTemplate.findFirst({
    where: {
      documentType: DocumentType.INVOICE,
      isDefault: true,
    },
  });

  if (existingDefault) {
    return existingDefault;
  }

  const existingInvoiceTemplate = await prisma.documentTemplate.findFirst({
    where: { documentType: DocumentType.INVOICE },
    orderBy: { createdAt: "asc" },
  });

  if (existingInvoiceTemplate) {
    return prisma.documentTemplate.update({
      where: { id: existingInvoiceTemplate.id },
      data: { isDefault: true },
    });
  }

  return prisma.documentTemplate.create({
    data: {
      documentType: DocumentType.INVOICE,
      outputFormat: DocumentOutputFormat.PDF,
      name: "Default invoice",
      html: defaultInvoiceTemplateHtml,
      isDefault: true,
    },
  });
}
