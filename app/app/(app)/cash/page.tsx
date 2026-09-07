import Link from "next/link";
import { CashCountKind, MoneyAccountType } from "@prisma/client";

import { WritableEditionOnly } from "@/components/edition-read-only";
import { EmptyPage, PageHeader, buttonClasses } from "@/components/ui";
import { isAdmin, requireMoneyAccountManager } from "@/lib/access";
import { editionBudgets } from "@/lib/budgets";
import { countTotal } from "@/lib/cash";
import { plannedEntries, registerFigures } from "@/lib/cash-register";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";

import { CashRegistersClient, type CashRegisterRow } from "./client";
import OpenRegisterModal from "./open-register-modal";

/**
 * A till is opened against a CASH money account by counting a float into it, and
 * closed later by counting what is left. Counting is not booking — closing
 * writes nothing. An admin then books a closed register: three journal entries,
 * once, from the figures this page computes for every closed unbooked register.
 */
export default async function CashPage() {
  // Hiding /cash from the sidebar is not access control: the screen carries
  // every register's counts and, for an admin, the edition's budgets and
  // cost-centre codes. The same role that may open a till may read the page.
  const access = await requireMoneyAccountManager();
  const admin = isAdmin(access);

  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editionId = await resolveEditionIdOrNull();

  if (!editionId) {
    return (
      <EmptyPage eyebrow={copy.cash.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  const cashAccounts = await prisma.moneyAccount.findMany({
    where: { editionId, type: MoneyAccountType.CASH },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (cashAccounts.length === 0) {
    return (
      <EmptyPage eyebrow={copy.cash.title} title={copy.cash.noCashAccounts}>
        <p className="text-sm text-[var(--muted)]">{copy.cash.noCashAccountsHint}</p>
        <Link href="/money-accounts" className={buttonClasses("primary", "md", "mt-4")}>
          {copy.shell.moneyAccounts}
        </Link>
      </EmptyPage>
    );
  }

  // Only an admin can open the booking modal, so only an admin is shipped the
  // lists it needs.
  const [registers, budgets, costCenters] = await Promise.all([
    prisma.cashRegister.findMany({
      where: { editionId },
      // Open tills first (closedAt null), then the most recently opened.
      orderBy: [{ closedAt: { sort: "asc", nulls: "first" } }, { openedAt: "desc" }],
      include: {
        moneyAccount: { select: { name: true } },
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
        journaledBy: { select: { name: true } },
        counts: { select: { kind: true, denomination: true, quantity: true } },
      },
    }),
    admin ? editionBudgets(editionId) : [],
    admin
      ? prisma.costCenter.findMany({
          where: { editionId },
          orderBy: { code: "asc" },
          select: { id: true, code: true },
        })
      : [],
  ]);

  // The figures for every closed, not-yet-booked register — in parallel, so the
  // page waits on the slowest read once, not on a queue of them.
  const bookable = registers.filter((register) => register.closedAt && !register.journaledAt);
  const figuresById = new Map(
    await Promise.all(
      bookable.map(async (register) => [register.id, await registerFigures(prisma, register.id)] as const),
    ),
  );

  const rows: CashRegisterRow[] = registers.map((register) => {
    const openingCounts = register.counts
      .filter((count) => count.kind === CashCountKind.OPENING)
      .map((count) => ({ denomination: count.denomination, quantity: count.quantity }));
    const closingCounts = register.counts
      .filter((count) => count.kind === CashCountKind.CLOSING)
      .map((count) => ({ denomination: count.denomination, quantity: count.quantity }));

    const figures = figuresById.get(register.id) ?? null;

    return {
      id: register.id,
      name: register.name,
      cashAccount: register.moneyAccount.name,
      openedAt: register.openedAt.toISOString().slice(0, 10),
      openedBy: register.openedBy?.name ?? null,
      closedAt: register.closedAt ? register.closedAt.toISOString().slice(0, 10) : null,
      closedBy: register.closedBy?.name ?? null,
      journaledAt: register.journaledAt ? register.journaledAt.toISOString().slice(0, 10) : null,
      journaledBy: register.journaledBy?.name ?? null,
      floatTotal: countTotal(openingCounts),
      closingTotal: register.closedAt ? countTotal(closingCounts) : null,
      openingCounts,
      closingCounts,
      booking: figures
        ? {
            figures,
            entries: plannedEntries(figures).map((entry) => ({
              kind: entry.kind,
              accountType: entry.accountType,
              amount: entry.amount,
            })),
          }
        : null,
    };
  });

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        title={copy.cash.title}
        description={copy.cash.subtitle}
        actions={
          <WritableEditionOnly>
            <OpenRegisterModal locale={locale} cashAccounts={cashAccounts} />
          </WritableEditionOnly>
        }
      />

      <CashRegistersClient
        locale={locale}
        registers={rows}
        isAdmin={admin}
        budgets={budgets}
        costCenters={costCenters}
      />
    </div>
  );
}
