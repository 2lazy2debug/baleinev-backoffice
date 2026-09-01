import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Payload = {
  stockPlaceId?: string;
};

/**
 * Which stock this user is working in — the same shape as the edition
 * preference, and for the same reason: the app asks once, then opens straight
 * onto the contents every time after that.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const stockPlaceId = String(payload.stockPlaceId ?? "").trim();

  if (!stockPlaceId) {
    return NextResponse.json({ ok: false, error: "Missing stock" }, { status: 400 });
  }

  const stockPlace = await prisma.stockPlace.findUnique({ where: { id: stockPlaceId }, select: { id: true } });

  if (!stockPlace) {
    return NextResponse.json({ ok: false, error: "Unknown stock" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { selectedStockPlaceId: stockPlace.id },
  });

  return NextResponse.json({ ok: true });
}
