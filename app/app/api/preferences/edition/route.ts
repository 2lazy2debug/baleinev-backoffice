import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Payload = {
  editionId?: string;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const editionId = String(payload.editionId ?? "").trim();

  if (!editionId) {
    return NextResponse.json({ ok: false, error: "Missing edition" }, { status: 400 });
  }

  const edition = await prisma.edition.findUnique({ where: { id: editionId }, select: { id: true } });

  if (!edition) {
    return NextResponse.json({ ok: false, error: "Unknown edition" }, { status: 404 });
  }

  // Any edition is selectable, closed ones included — a closed edition is
  // read-only, not out of reach.
  await prisma.user.update({
    where: { id: session.user.id },
    data: { selectedEditionId: edition.id },
  });

  return NextResponse.json({ ok: true });
}
