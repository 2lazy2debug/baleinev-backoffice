import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Which edition is this request in?
 *
 * The answer lives on the user (`User.selectedEditionId`), not on a global flag.
 * `Edition.isDefault` only *seeds* that column for an account that has none — it
 * is never consulted again, so changing the default affects new accounts only
 * and moves nobody who is already working.
 */

export type EditionContext = {
  id: string;
  name: string;
  closedAt: Date | null;
  drivingRatePerKm: number;
};

/**
 * Writes the seed. The only place that does, so the rule holds however an
 * account comes into being: first login, admin-created, or predating the
 * feature. Returns null when there is no default edition to seed from.
 */
export async function ensureUserEdition(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { selectedEditionId: true },
  });

  if (!user) {
    return null;
  }

  if (user.selectedEditionId) {
    return user.selectedEditionId;
  }

  const defaultEdition = await prisma.edition.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });

  if (!defaultEdition) {
    return null;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { selectedEditionId: defaultEdition.id },
  });

  return defaultEdition.id;
}

/**
 * Nullable resolver for render paths. Returns null when nobody is signed in, or
 * when there is no edition to fall back on — the caller shows a "pick an
 * edition" state instead of throwing, so a missing edition never 500s the shell.
 */
export async function resolveEditionIdOrNull(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { selectedEditionId: true },
  });

  // `onDelete: SetNull` already cleared the column if the edition was deleted,
  // so a non-null value here still points at a row that exists.
  return user?.selectedEditionId ?? (await ensureUserEdition(userId));
}

/** Throwing resolver for write paths, where "no edition" is an error to report. */
export async function resolveEditionId(): Promise<string> {
  const editionId = await resolveEditionIdOrNull();

  if (!editionId) {
    throw new Error("Select an edition before managing this section.");
  }

  return editionId;
}

/** The current edition itself, for headers and pickers. Null when there is none. */
export async function resolveEdition(): Promise<EditionContext | null> {
  const editionId = await resolveEditionIdOrNull();

  if (!editionId) {
    return null;
  }

  const edition = await prisma.edition.findUnique({
    where: { id: editionId },
    select: { id: true, name: true, closedAt: true, drivingRatePerKm: true },
  });

  if (!edition) {
    return null;
  }

  return { ...edition, drivingRatePerKm: Number(edition.drivingRatePerKm) };
}

/**
 * Refuses a write against a closed edition. Closing means read-only, not gone:
 * pages, exports and PDFs keep working, every write is turned away here.
 *
 * Passwords, users, templates and event types carry no `editionId` — they are
 * global on purpose and stay writable whatever edition the user is in. Do not
 * add this guard to them.
 */
export async function requireWritableEdition(editionId: string): Promise<string> {
  const edition = await prisma.edition.findUnique({
    where: { id: editionId },
    select: { closedAt: true },
  });

  if (!edition) {
    throw new Error("Edition not found.");
  }

  if (edition.closedAt) {
    throw new Error("This edition is closed. Reopen it to make changes.");
  }

  return editionId;
}

/** Resolve and guard in one call, for writes against the user's own edition. */
export async function resolveWritableEditionId(): Promise<string> {
  return requireWritableEdition(await resolveEditionId());
}
