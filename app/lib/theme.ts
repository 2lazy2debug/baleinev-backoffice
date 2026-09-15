import { cookies } from "next/headers";

export type Theme = "dark" | "light";

export const themeCookieName = "blv_theme";

function isTheme(value: string | undefined): value is Theme {
  return value === "dark" || value === "light";
}

// Same shape as getLocale(): a cookie read before any session exists, so the
// login screen gets the right theme too. Default stays "dark" — today's look,
// unchanged until someone opts into light.
export async function getTheme(): Promise<Theme> {
  const cookieStore = await cookies();
  const candidate = cookieStore.get(themeCookieName)?.value;
  if (isTheme(candidate)) {
    return candidate;
  }
  return "dark";
}
