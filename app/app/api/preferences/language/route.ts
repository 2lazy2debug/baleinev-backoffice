import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { localeCookieName, supportedLocales, type Locale } from "@/lib/i18n-dictionaries";

type Payload = {
  locale?: string;
  refundFirstName?: string;
  refundLastName?: string;
  refundIban?: string;
  refundZip?: string;
  refundCity?: string;
};

function toNullableString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Payload;
  const locale = payload.locale;

  if (!locale || !supportedLocales.includes(locale as Locale)) {
    return NextResponse.json({ ok: false, error: "Invalid locale" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });

  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        refundFirstName: toNullableString(payload.refundFirstName),
        refundLastName: toNullableString(payload.refundLastName),
        refundIban: toNullableString(payload.refundIban),
        refundZip: toNullableString(payload.refundZip),
        refundCity: toNullableString(payload.refundCity),
      },
    });
  }

  response.cookies.set(localeCookieName, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
