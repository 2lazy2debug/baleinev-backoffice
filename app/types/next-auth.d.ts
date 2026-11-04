import type { DefaultSession } from "next-auth";
import type { UserRole } from "@prisma/client";
import type { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: UserRole;
    departmentIds: string[];
    departmentNames: string[];
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      departmentIds: string[];
      departmentNames: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    departmentIds?: string[];
    departmentNames?: string[];
  }
}