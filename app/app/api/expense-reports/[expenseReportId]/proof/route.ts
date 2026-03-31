import { NextResponse } from "next/server";

import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ expenseReportId: string }> },
) {
  await getCurrentUserAccess();
  const { expenseReportId } = await params;

  const expenseReport = await prisma.expenseReport.findUnique({
    where: { id: expenseReportId },
    select: {
      proofData: true,
      proofMimeType: true,
      proofFilename: true,
    },
  });

  if (!expenseReport) {
    return NextResponse.json({ error: "Expense report not found." }, { status: 404 });
  }

  if (!expenseReport.proofData || !expenseReport.proofMimeType || !expenseReport.proofFilename) {
    return NextResponse.json({ error: "No proof file available for this expense report." }, { status: 404 });
  }

  return new Response(Uint8Array.from(expenseReport.proofData), {
    headers: {
      "Content-Type": expenseReport.proofMimeType,
      "Content-Disposition": `inline; filename="${expenseReport.proofFilename}"`,
      "Cache-Control": "no-store",
    },
  });
}
