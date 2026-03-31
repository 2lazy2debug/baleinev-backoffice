import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/login" ||
    pathname === "/favicon.ico" ||
    pathname === "/logo_blv.png"
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/preferences/language")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    return NextResponse.next();
  }

  if (token.role === "DEPARTMENT") {
    if (
      pathname === "/" ||
      pathname.startsWith("/editions") ||
      pathname.startsWith("/journal") ||
      pathname.startsWith("/money-accounts") ||
      pathname.startsWith("/cost-centers") ||
      pathname.startsWith("/invoices") ||
      pathname.startsWith("/templates") ||
      pathname.startsWith("/departments") ||
      pathname.startsWith("/users")
    ) {
      return NextResponse.redirect(new URL("/budget", request.url));
    }
  }

  // /tasks, /calendar and /events are accessible to all authenticated roles

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
