import { NextResponse } from "next/server";
import puppeteer from "puppeteer";

import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { renderShiftSchedulePdf } from "@/lib/shift-schedule-pdf";

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    // Any signed-in user can pull the schedule — staffing visibility isn't
    // admin-gated, unlike the financial documents in /api/invoices.
    await getCurrentUserAccess();

    const { eventId } = await context.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        name: true,
        days: {
          where: { isOff: false },
          orderBy: { date: "asc" },
          select: {
            id: true,
            date: true,
            shifts: {
              orderBy: { startTime: "asc" },
              select: {
                id: true,
                startTime: true,
                endTime: true,
                role: true,
                assignments: { select: { user: { select: { id: true, name: true } } } },
              },
            },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const locale = await getLocale();
    const copy = getDictionary(locale).events;

    const { html, footerHtml } = renderShiftSchedulePdf(event, {
      staffColumn: copy.pdfStaffColumn,
      noShifts: copy.pdfNoShifts,
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "8mm", right: "8mm", bottom: "18mm", left: "8mm" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: footerHtml,
      });

      const safeFileName =
        event.name
          .replace(/[^a-zA-Z0-9-_]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") || "event";

      return new Response(Uint8Array.from(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeFileName}-schedule.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate schedule PDF." },
      { status: 400 },
    );
  }
}
