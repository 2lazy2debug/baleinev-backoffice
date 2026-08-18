import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { MONEY_ACCOUNT_MANAGER_DEPARTMENT } from "@/lib/money-account-roles";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/health" ||
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
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (token.role === "DEPARTMENT") {
    const isMoneyAccountManager = (token.departmentRoleNames ?? []).includes(MONEY_ACCOUNT_MANAGER_DEPARTMENT);

    if (pathname.startsWith("/money-accounts")) {
      if (!isMoneyAccountManager) {
        return NextResponse.redirect(new URL("/budget", request.url));
      }
    } else if (
      pathname === "/" ||
      pathname.startsWith("/editions") ||
      pathname.startsWith("/journal") ||
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
