import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MONEY_ACCOUNT_MANAGER_DEPARTMENT } from "@/lib/money-account-roles";

export type AccessContext = {
  id: string;
  userName: string;
  email: string;
  role: "ADMIN" | "DEPARTMENT";
  departmentRoleIds: string[];
  departmentRoleNames: string[];
  refundFirstName: string | null;
  refundLastName: string | null;
  refundIban: string | null;
  refundZip: string | null;
  refundCity: string | null;
};

export async function getCurrentUserAccess(): Promise<AccessContext> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      refundFirstName: true,
      refundLastName: true,
      refundIban: true,
      refundZip: true,
      refundCity: true,
      departmentRoles: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });

  if (!user) {
    redirect("/login");
  }

  return {
    id: user.id,
    userName: user.name,
    email: user.email,
    role: user.role,
    departmentRoleIds: user.departmentRoles.map((departmentRole) => departmentRole.id),
    departmentRoleNames: user.departmentRoles.map((departmentRole) => departmentRole.name),
    refundFirstName: user.refundFirstName,
    refundLastName: user.refundLastName,
    refundIban: user.refundIban,
    refundZip: user.refundZip,
    refundCity: user.refundCity,
  };
}

export async function requireAdmin() {
  const access = await getCurrentUserAccess();

  if (access.role !== "ADMIN") {
    throw new Error("Unauthorized.");
  }

  return access;
}

// Money accounts (bank/cash/other) are financial configuration: admins manage
// them everywhere, and members of the accounting department additionally
// manage them for editions they're part of.
export function canManageMoneyAccounts(access: AccessContext): boolean {
  return access.role === "ADMIN" || access.departmentRoleNames.includes(MONEY_ACCOUNT_MANAGER_DEPARTMENT);
}

export async function requireMoneyAccountManager() {
  const access = await getCurrentUserAccess();

  if (!canManageMoneyAccounts(access)) {
    throw new Error("Unauthorized.");
  }

  return access;
}

export function isAdmin(access: AccessContext): boolean {
  return access.role === "ADMIN";
}

/**
 * Department-role ids a user is allowed to see, or `null` for admins (who see
 * everything). Use to build a Prisma `where` filter for department-scoped data.
 */
export function accessibleDepartmentRoleIds(access: AccessContext): string[] | null {
  return access.role === "ADMIN" ? null : access.departmentRoleIds;
}

/** True when the user shares at least one department with the given entry (admins always). */
export function canAccessDepartments(access: AccessContext, departmentRoleIds: string[]): boolean {
  if (access.role === "ADMIN") {
    return true;
  }

  const allowed = new Set(access.departmentRoleIds);
  return departmentRoleIds.some((id) => allowed.has(id));
}
