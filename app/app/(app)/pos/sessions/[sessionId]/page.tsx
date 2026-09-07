import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Card, CardGrid, PageHeader, SectionTitle, buttonClasses, compactOnMobileWidths } from "@/components/ui";
import { requireAdmin } from "@/lib/access";
import { fromRappen, toRappen } from "@/lib/cash";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { totalsFor } from "@/lib/pos";
import { formatCurrency } from "@/lib/utils";

import { methodLabel, orderMethods, type PosMethod } from "../../pos-methods";
import { SessionDetailClient, type SaleRow } from "./client";

type Params = { params: Promise<{ sessionId: string }> };

/**
 * One session's transactions, in order, with their lines and the change handed
 * back. Admin-only and read-only — labels and prices are the snapshots the sale
 * was rung up on, never re-derived from the template.
 */
export default async function PosSessionDetailPage({ params }: Params) {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const { sessionId } = await params;

  const editionId = await resolveEditionIdOrNull();

  const session = editionId
    ? await prisma.posSession.findFirst({
        where: { id: sessionId, editionId },
        select: {
          name: true,
          openedAt: true,
          closedAt: true,
          openedBy: { select: { name: true } },
          template: { select: { name: true } },
          cashRegister: { select: { name: true } },
          methods: { select: { method: true } },
          sales: {
            orderBy: { soldAt: "desc" },
            select: {
              id: true,
              soldAt: true,
              method: true,
              total: true,
              cashGiven: true,
              changeDue: true,
              soldBy: { select: { name: true } },
              lines: { select: { label: true, unitPrice: true, quantity: true, elementId: true } },
              change: { orderBy: { denomination: "desc" }, select: { denomination: true, quantity: true } },
            },
          },
        },
      })
    : null;

  if (!session) {
    notFound();
  }

  const methods = orderMethods(session.methods.map((row) => row.method as PosMethod));
  const totals = totalsFor(session.sales, methods);

  const clock = new Intl.DateTimeFormat(locale === "fr" ? "fr-CH" : "en-CH", { timeStyle: "short" });
  const stamp = new Intl.DateTimeFormat(locale === "fr" ? "fr-CH" : "en-CH", { dateStyle: "medium", timeStyle: "short" });

  const sales: SaleRow[] = session.sales.map((sale) => ({
    id: sale.id,
    at: clock.format(sale.soldAt),
    seller: sale.soldBy?.name ?? null,
    method: sale.method as PosMethod,
    total: toRappen(sale.total),
    cashGiven: sale.cashGiven == null ? null : toRappen(sale.cashGiven),
    changeDue: sale.changeDue == null ? null : toRappen(sale.changeDue),
    lines: sale.lines.map((line) => ({
      label: line.label,
      unitPrice: toRappen(line.unitPrice),
      quantity: line.quantity,
      isCustom: line.elementId === null,
    })),
    change: sale.change.map((row) => ({ denomination: row.denomination, quantity: row.quantity })),
  }));

  const openedLine = `${stamp.format(session.openedAt)}${session.openedBy ? ` · ${session.openedBy.name}` : ""}`;

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.pos.sessionsTitle}
        title={session.name}
        description={`${session.template.name}${session.cashRegister ? ` · ${session.cashRegister.name}` : ""}`}
        actions={
          <Link
            href="/pos/sessions"
            title={copy.pos.backToSessions}
            aria-label={copy.pos.backToSessions}
            className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
          >
            <ArrowLeft />
            <span className="hidden lg:inline">{copy.pos.backToSessions}</span>
          </Link>
        }
      />

      <CardGrid>
        <StatCard span="1/4" label={copy.pos.takenTotal} value={formatCurrency(fromRappen(totals.total))} />
        <StatCard span="1/4" label={copy.pos.saleCount} value={String(totals.saleCount)} />
        <StatCard span="1/4" label={copy.pos.changeGiven} value={formatCurrency(fromRappen(totals.changeGiven))} />
      </CardGrid>

      <SectionTitle desktopOnly>{copy.pos.perMethod}</SectionTitle>
      <CardGrid>
        {methods.map((method) => (
          <StatCard
            key={method}
            span="1/4"
            label={methodLabel(copy.pos, method)}
            value={formatCurrency(fromRappen(totals.byMethod[method] ?? 0))}
          />
        ))}
      </CardGrid>

      <div className="space-y-2">
        <p className="text-xs text-[var(--muted)]">
          <span className="font-medium text-[var(--ink)]">{copy.pos.opened}</span> · {openedLine}
        </p>
        {session.closedAt ? (
          <p className="text-xs text-[var(--muted)]">
            <span className="font-medium text-[var(--ink)]">{copy.pos.closed}</span> ·{" "}
            {stamp.format(session.closedAt)}
          </p>
        ) : null}
      </div>

      <SessionDetailClient locale={locale} sales={sales} />
    </div>
  );
}

function StatCard({
  span,
  label,
  value,
}: {
  span: "1/4";
  label: string;
  value: string;
}) {
  return (
    <Card span={span}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </Card>
  );
}
