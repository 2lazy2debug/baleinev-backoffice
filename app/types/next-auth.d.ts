import type { DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: "ADMIN" | "DEPARTMENT";
    departmentRoleIds: string[];
    departmentRoleNames: string[];
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "ADMIN" | "DEPARTMENT";
      departmentRoleIds: string[];
      departmentRoleNames: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "ADMIN" | "DEPARTMENT";
    departmentRoleIds?: string[];
    departmentRoleNames?: string[];
  }
}