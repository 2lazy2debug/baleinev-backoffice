import Link from "next/link";
import { CashCountKind, MoneyAccountType } from "@prisma/client";

import { WritableEditionOnly } from "@/components/edition-read-only";
import { EmptyPage, PageHeader, buttonClasses } from "@/components/ui";
import { countTotal } from "@/lib/cash";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";

import { CashRegistersClient, type CashRegisterRow } from "./client";
import OpenRegisterModal from "./open-register-modal";

/**
 * A till is opened against a CASH money account by counting a float into it, and
 * closed later by counting what is left. Counting is not booking — nothing on
 * this screen touches the journal.
 */
export default async function CashPage() {
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

  const registers = await prisma.cashRegister.findMany({
    where: { editionId },
    // Open tills first (closedAt null), then the most recently opened.
    orderBy: [{ closedAt: { sort: "asc", nulls: "first" } }, { openedAt: "desc" }],
    include: {
      moneyAccount: { select: { name: true } },
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      counts: { select: { kind: true, denomination: true, quantity: true } },
    },
  });

  const rows: CashRegisterRow[] = registers.map((register) => {
    const openingCounts = register.counts
      .filter((count) => count.kind === CashCountKind.OPENING)
      .map((count) => ({ denomination: count.denomination, quantity: count.quantity }));
    const closingCounts = register.counts
      .filter((count) => count.kind === CashCountKind.CLOSING)
      .map((count) => ({ denomination: count.denomination, quantity: count.quantity }));

    return {
      id: register.id,
      name: register.name,
      cashAccount: register.moneyAccount.name,
      openedAt: register.openedAt.toISOString().slice(0, 10),
      openedBy: register.openedBy?.name ?? null,
      closedAt: register.closedAt ? register.closedAt.toISOString().slice(0, 10) : null,
      closedBy: register.closedBy?.name ?? null,
      floatTotal: countTotal(openingCounts),
      closingTotal: register.closedAt ? countTotal(closingCounts) : null,
      openingCounts,
      closingCounts,
    };
  });

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.cash.title}
        title={copy.cash.title}
        description={copy.cash.subtitle}
        actions={
          <WritableEditionOnly>
            <OpenRegisterModal locale={locale} cashAccounts={cashAccounts} />
          </WritableEditionOnly>
        }
      />

      <CashRegistersClient locale={locale} registers={rows} />
    </div>
  );
}
