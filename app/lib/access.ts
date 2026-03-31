import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
