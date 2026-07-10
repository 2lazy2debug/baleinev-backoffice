import { NextResponse } from "next/server";

import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { allowedProofMimeTypes, type ProofMimeType } from "@/lib/proof-upload";

function isAllowedMimeType(value: string): value is ProofMimeType {
  return (allowedProofMimeTypes as readonly string[]).includes(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ expenseReportId: string }> },
) {
  const access = await getCurrentUserAccess();
  const { expenseReportId } = await params;

  const expenseReport = await prisma.expenseReport.findUnique({
    where: { id: expenseReportId },
    select: {
      submittedById: true,
      proofData: true,
      proofMimeType: true,
      proofFilename: true,
    },
  });

  // Admins review every claim; everyone else may only open their own receipt.
  // Answer 404 rather than 403 so ids cannot be enumerated.
  if (!expenseReport || (access.role !== "ADMIN" && expenseReport.submittedById !== access.id)) {
    return NextResponse.json({ error: "Expense report not found." }, { status: 404 });
  }

  if (!expenseReport.proofData || !expenseReport.proofMimeType || !expenseReport.proofFilename) {
    return NextResponse.json({ error: "No proof file available for this expense report." }, { status: 404 });
  }

  // Reports uploaded before proofs were validated may carry an arbitrary stored type.
  const contentType = isAllowedMimeType(expenseReport.proofMimeType)
    ? expenseReport.proofMimeType
    : "application/octet-stream";

  const asciiFilename = expenseReport.proofFilename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

  return new Response(Uint8Array.from(expenseReport.proofData), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(expenseReport.proofFilename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "no-store",
    },
  });
}
