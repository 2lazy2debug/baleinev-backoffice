import { hash } from "bcrypt";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Baleinev Admin";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set before running the seed.");
  }

  await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: "ADMIN",
      passwordHash: await hash(password, 12),
    },
    create: {
      email,
      name,
      role: "ADMIN",
      passwordHash: await hash(password, 12),
    },
  });

  await seedDevFixtures();
}

/**
 * Fixtures that only make sense on a throwaway local database — the accounts and
 * the closed edition the docs/plans verification steps ask for ("test as a
 * DEPARTMENT user", "a link a closed edition would make read-only"), which the
 * one-admin production seed cannot provide.
 *
 * Guarded twice: an explicit opt-in *and* not-production. `npm run db:seed` is
 * safe to run on the box (the docs tell admins to, to reset the admin password)
 * and must never grow a second login there.
 */
async function seedDevFixtures() {
  if (process.env.SEED_DEV_FIXTURES !== "1" || process.env.NODE_ENV === "production") {
    return;
  }

  const devPassword = await hash("devpassword", 12);

  await prisma.user.upsert({
    where: { email: "dev-department@baleinev.local" },
    update: { role: "DEPARTMENT", passwordHash: devPassword },
    create: {
      email: "dev-department@baleinev.local",
      name: "Dev Department",
      role: "DEPARTMENT",
      passwordHash: devPassword,
    },
  });

  await prisma.edition.upsert({
    where: { name: "DEV — Closed edition" },
    update: { closedAt: new Date("2020-12-31T00:00:00.000Z") },
    create: {
      name: "DEV — Closed edition",
      isDefault: false,
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: new Date("2020-12-31T00:00:00.000Z"),
      closedAt: new Date("2020-12-31T00:00:00.000Z"),
    },
  });

  console.log(
    "🌱  dev fixtures: dev-department@baleinev.local / devpassword (DEPARTMENT), plus a closed edition",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
