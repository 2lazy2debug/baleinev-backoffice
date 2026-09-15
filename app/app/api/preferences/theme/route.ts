import { NextResponse } from "next/server";

import { themeCookieName, type Theme } from "@/lib/theme";

type Payload = {
  theme?: string;
};

function isTheme(value: string | undefined): value is Theme {
  return value === "dark" || value === "light";
}

// The theme is a cookie and nothing else — same shape as /api/preferences/language,
// so it answers before a session exists and the login screen gets it too.
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Payload;
  const theme = payload.theme;

  if (!isTheme(theme)) {
    return NextResponse.json({ ok: false, error: "Invalid theme" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(themeCookieName, theme, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
