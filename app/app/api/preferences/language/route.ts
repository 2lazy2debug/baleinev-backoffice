import { NextResponse } from "next/server";

import { localeCookieName, supportedLocales, type Locale } from "@/lib/i18n-dictionaries";

type Payload = {
  locale?: string;
};

// The locale is a cookie and nothing else — it has to answer before a session
// exists (the login screen reads it too). Everything else that used to be
// "settings" is the Account screen's, saved through its server actions.
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Payload;
  const locale = payload.locale;

  if (!locale || !supportedLocales.includes(locale as Locale)) {
    return NextResponse.json({ ok: false, error: "Invalid locale" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(localeCookieName, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
