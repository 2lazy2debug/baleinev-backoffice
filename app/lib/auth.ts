import { compare } from "bcrypt";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/db";
import { ensureUserEdition } from "@/lib/edition-context";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim();
        const password = credentials?.password;

        if (!email || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { departmentRoles: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
        });

        if (!user) {
          return null;
        }

        const valid = await compare(password, user.passwordHash);

        if (!valid) {
          return null;
        }

        // First login is one of the three moments an account can get its
        // edition. No-op once the user has one.
        await ensureUserEdition(user.id);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          departmentRoleIds: user.departmentRoles.map((departmentRole) => departmentRole.id),
          departmentRoleNames: user.departmentRoles.map((departmentRole) => departmentRole.name),
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
        token.departmentRoleIds = user.departmentRoleIds;
        token.departmentRoleNames = user.departmentRoleNames;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as "ADMIN" | "DEPARTMENT") ?? "ADMIN";
        session.user.departmentRoleIds = (token.departmentRoleIds as string[] | undefined) ?? [];
        session.user.departmentRoleNames = (token.departmentRoleNames as string[] | undefined) ?? [];
      }

      return session;
    },
  },
};