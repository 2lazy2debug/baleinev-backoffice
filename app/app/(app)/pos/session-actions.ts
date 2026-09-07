"use server";

import { PosPaymentMethod, PosSessionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getCurrentUserAccess } from "@/lib/access";
import { type DenominationCount, makeChange } from "@/lib/cash";
import { prisma } from "@/lib/db";
import { resolveWritableEditionId } from "@/lib/edition-context";
import { type ActionState, getRequiredString, toActionErrorMessage } from "@/lib/server-action-helpers";
import { removeFromPlace } from "@/lib/stock-movements";

/**
 * The selling side of the POS. Kept apart from 103's `actions.ts`, which is
 * admin-only template configuration — here **any signed-in user** may open,
 * join, pause and close a session and ring up sales. The money is already
 * fenced by the cash register somebody with the money-account role had to open.
 *
 * Every write still goes through `resolveWritableEditionId()`: a closed edition
 * sells nothing, and neither opens, joins, pauses nor closes a session.
 */

const PAYMENT_METHODS = Object.values(PosPaymentMethod);

/** Rappen (integer) to the franc string a `Decimal(10,2)` column wants. */
function rappenToDecimal(rappen: number): string {
  return (rappen / 100).toFixed(2);
}

/** The session a form field points at, proven to live in the current edition. */
async function sessionInEdition(sessionId: string, editionId: string) {
  const session = await prisma.posSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      editionId: true,
      status: true,
      stockPlaceId: true,
      methods: { select: { method: true } },
    },
  });

  if (!session || session.editionId !== editionId) {
    throw new Error("That session no longer exists. Refresh and try again.");
  }

  return session;
}

export async function openPosSessionAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const editionId = await resolveWritableEditionId();

    const name = getRequiredString(formData, "name");
    const templateId = getRequiredString(formData, "templateId");

    const template = await prisma.posTemplate.findUnique({
      where: { id: templateId },
      select: { editionId: true, _count: { select: { cells: true } } },
    });

    if (!template || template.editionId !== editionId) {
      throw new Error("That template no longer exists. Refresh and try again.");
    }

    if (template._count.cells === 0) {
      throw new Error("That template has no tiles yet.");
    }

    const methods = [
      ...new Set(
        formData
          .getAll("methods")
          .map((value) => String(value))
          .filter((value): value is PosPaymentMethod => PAYMENT_METHODS.includes(value as PosPaymentMethod)),
      ),
    ];

    if (methods.length === 0) {
      throw new Error("Pick at least one way to be paid.");
    }

    let cashRegisterId: string | null = null;

    if (methods.includes(PosPaymentMethod.CASH)) {
      cashRegisterId = String(formData.get("cashRegisterId") ?? "").trim() || null;

      const register = cashRegisterId
        ? await prisma.cashRegister.findUnique({
            where: { id: cashRegisterId },
            select: { editionId: true, closedAt: true },
          })
        : null;

      if (!register || register.editionId !== editionId || register.closedAt) {
        throw new Error("Pick an open cash register, or drop cash as a payment method.");
      }
    }

    // Optional, and fixed at open. A stock place is global, not edition-scoped,
    // so the only thing to check is that it still exists.
    const stockPlaceId = String(formData.get("stockPlaceId") ?? "").trim() || null;

    if (stockPlaceId) {
      const place = await prisma.stockPlace.findUnique({ where: { id: stockPlaceId }, select: { id: true } });

      if (!place) {
        throw new Error("That stock no longer exists.");
      }
    }

    await prisma.$transaction(async (tx) => {
      const session = await tx.posSession.create({
        data: { editionId, templateId, cashRegisterId, stockPlaceId, name, openedById: access.id },
      });

      await tx.posSessionPayment.createMany({
        data: methods.map((method) => ({ sessionId: session.id, method })),
      });

      // Opening a session joins it — asking the opener to pick it again is a
      // step for nothing.
      await tx.user.update({ where: { id: access.id }, data: { selectedPosSessionId: session.id } });
    });

    revalidatePath("/pos");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** Join a running session. Plain async — the picker calls it from a click. */
export async function joinPosSessionAction(sessionId: string): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const editionId = await resolveWritableEditionId();

    const session = await sessionInEdition(sessionId, editionId);

    if (session.status === PosSessionStatus.CLOSED) {
      throw new Error("That session is closed.");
    }

    await prisma.user.update({ where: { id: access.id }, data: { selectedPosSessionId: sessionId } });

    revalidatePath("/pos");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** Step off the till — back to the picker. */
export async function leavePosSessionAction(): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    await resolveWritableEditionId();

    await prisma.user.update({ where: { id: access.id }, data: { selectedPosSessionId: null } });

    revalidatePath("/pos");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function setPosSessionStatusAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await getCurrentUserAccess();
    const editionId = await resolveWritableEditionId();

    const sessionId = getRequiredString(formData, "sessionId");
    const status = getRequiredString(formData, "status");

    if (!Object.values(PosSessionStatus).includes(status as PosSessionStatus)) {
      throw new Error("That is not a session status.");
    }

    const session = await sessionInEdition(sessionId, editionId);

    // CLOSED is terminal — the takings are read when the register is closed, and
    // a reopened session would muddy that.
    if (session.status === PosSessionStatus.CLOSED) {
      throw new Error("That session is closed. Open a new one.");
    }

    if (status === PosSessionStatus.CLOSED) {
      await prisma.$transaction(async (tx) => {
        await tx.posSession.update({
          where: { id: sessionId },
          data: { status: PosSessionStatus.CLOSED, closedAt: new Date() },
        });

        // Two phones may have been in there — drop every one back to the picker.
        await tx.user.updateMany({
          where: { selectedPosSessionId: sessionId },
          data: { selectedPosSessionId: null },
        });
      });
    } else {
      await prisma.posSession.update({
        where: { id: sessionId },
        data: { status: status as PosSessionStatus },
      });
    }

    revalidatePath("/pos");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

type PostedLine = { elementId: string | null; label: string; unitPrice: number; quantity: number };

/** Parse and validate the cart — the client's arithmetic is never trusted. */
function parseLines(raw: string): PostedLine[] {
  let posted: unknown;

  try {
    posted = JSON.parse(raw);
  } catch {
    throw new Error("That sale could not be read. Start it again.");
  }

  if (!Array.isArray(posted) || posted.length === 0) {
    throw new Error("That sale could not be read. Start it again.");
  }

  return posted.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("That sale could not be read. Start it again.");
    }

    const { elementId, label, unitPrice, quantity } = entry as Record<string, unknown>;

    const cleanElementId = elementId == null || elementId === "" ? null : String(elementId);
    const cleanLabel = typeof label === "string" ? label.trim() : "";

    // `unitPrice` is whole rappen and may be negative — a deposit handed back.
    if (
      !cleanLabel ||
      typeof unitPrice !== "number" ||
      !Number.isInteger(unitPrice) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw new Error("That sale could not be read. Start it again.");
    }

    return { elementId: cleanElementId, label: cleanLabel, unitPrice, quantity };
  });
}

export async function recordPosSaleAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const editionId = await resolveWritableEditionId();

    const sessionId = getRequiredString(formData, "sessionId");
    const method = getRequiredString(formData, "method");

    if (!PAYMENT_METHODS.includes(method as PosPaymentMethod)) {
      throw new Error("That sale could not be read. Start it again.");
    }

    const session = await sessionInEdition(sessionId, editionId);

    if (session.status !== PosSessionStatus.OPEN) {
      throw new Error("That session is not open. Refresh and try again.");
    }

    if (!session.methods.some((m) => m.method === method)) {
      throw new Error("That payment method is not enabled for this session.");
    }

    const lines = parseLines(String(formData.get("lines") ?? ""));

    // A stale tab could carry an article id that has since been deleted.
    const elementIds = [...new Set(lines.map((line) => line.elementId).filter((id): id is string => id !== null))];
    if (elementIds.length > 0) {
      const known = await prisma.stockElement.findMany({
        where: { id: { in: elementIds } },
        select: { id: true },
      });
      if (known.length !== elementIds.length) {
        throw new Error("That sale could not be read. Start it again.");
      }
    }

    // Recomputed on the server, in rappen. Any total the client sent is ignored.
    const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

    const isCash = method === PosPaymentMethod.CASH;
    let cashGiven: number | null = null;
    let changeDue: number | null = null;
    let changeSheet: DenominationCount[] = [];

    if (isCash) {
      if (total > 0) {
        const given = Number(String(formData.get("cashGiven") ?? "").trim());
        if (!Number.isInteger(given) || given < total) {
          throw new Error("The amount given is less than the total.");
        }
        cashGiven = given;
        changeDue = given - total;
      } else {
        // An all-refund sale: nothing comes in, `-total` goes out of the drawer.
        cashGiven = 0;
        changeDue = -total;
      }
      changeSheet = makeChange(changeDue);
    }

    await prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.create({
        data: {
          sessionId,
          soldById: access.id,
          method: method as PosPaymentMethod,
          total: rappenToDecimal(total),
          cashGiven: cashGiven === null ? null : rappenToDecimal(cashGiven),
          changeDue: changeDue === null ? null : rappenToDecimal(changeDue),
        },
      });

      await tx.posSaleLine.createMany({
        data: lines.map((line) => ({
          saleId: sale.id,
          elementId: line.elementId,
          label: line.label,
          unitPrice: rappenToDecimal(line.unitPrice),
          quantity: line.quantity,
        })),
      });

      if (changeSheet.length > 0) {
        await tx.posSaleChange.createMany({
          data: changeSheet.map((row) => ({
            saleId: sale.id,
            denomination: row.denomination,
            quantity: row.quantity,
          })),
        });
      }

      // A sale moves stock only when the session names a shelf. Every tracked
      // line then leaves that shelf as an ordinary Out, oldest expiry first —
      // clamped at zero, never refused: a till that stops selling because a
      // delivery was not filed is worse than a count that reads zero and says
      // so. A custom sale (no `elementId`) and an untracked article
      // (`tracksStock` off) move nothing; one query settles which lines count.
      if (session.stockPlaceId && elementIds.length > 0) {
        const tracked = await tx.stockElement.findMany({
          where: { id: { in: elementIds }, tracksStock: true },
          select: { id: true },
        });
        const tracksStock = new Set(tracked.map((element) => element.id));

        for (const line of lines) {
          if (line.elementId && tracksStock.has(line.elementId)) {
            await removeFromPlace(
              tx,
              { stockPlaceId: session.stockPlaceId, elementId: line.elementId },
              line.quantity,
              access.id,
            );
          }
        }
      }
    });

    revalidatePath("/pos");
    revalidatePath("/stock");
    revalidatePath("/stock/history");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
