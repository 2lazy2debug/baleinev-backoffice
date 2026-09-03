import type { DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: "ADMIN" | "DEPARTMENT";
    departmentIds: string[];
    departmentNames: string[];
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "ADMIN" | "DEPARTMENT";
      departmentIds: string[];
      departmentNames: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "ADMIN" | "DEPARTMENT";
    departmentIds?: string[];
    departmentNames?: string[];
  }
}