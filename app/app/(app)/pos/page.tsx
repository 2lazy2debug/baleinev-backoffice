import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { PosSessionStatus } from "@prisma/client";

import { EmptyPage, PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";
import { getCurrentUserAccess } from "@/lib/access";
import { toRappen } from "@/lib/cash";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";

import { orderMethods, type PosMethod } from "./pos-methods";
import { SessionPicker, type PickerSession } from "./session-picker";
import { SessionsModal } from "./sessions-modal";
import { Till, type Tile } from "./till";

/**
 * The till itself. Any signed-in user may open a session, join one from as many
 * phones as they like, and sell — the money is fenced by the cash register
 * somebody with the money-account role had to open. Templates and registers are
 * still gated where they were (admin / `canManageMoneyAccounts`).
 */
export default async function PosPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editionId = await resolveEditionIdOrNull();

  if (!editionId) {
    return (
      <EmptyPage eyebrow={copy.pos.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  const [sessions, templates, registers, me] = await Promise.all([
    prisma.posSession.findMany({
      where: { editionId, status: { not: PosSessionStatus.CLOSED } },
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        templateId: true,
        template: { select: { name: true } },
        methods: { select: { method: true } },
        cashRegister: { select: { name: true } },
        _count: { select: { sales: true } },
      },
    }),
    prisma.posTemplate.findMany({
      where: { editionId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { cells: true } } },
    }),
    prisma.cashRegister.findMany({
      where: { editionId, closedAt: null },
      orderBy: { openedAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({ where: { id: access.id }, select: { selectedPosSessionId: true } }),
  ]);

  const templateOptions = templates.map((template) => ({
    id: template.id,
    name: template.name,
    tileCount: template._count.cells,
  }));

  const sessionRows: PickerSession[] = sessions.map((session) => ({
    id: session.id,
    name: session.name,
    status: session.status as "OPEN" | "PAUSED",
    templateName: session.template.name,
    methods: orderMethods(session.methods.map((row) => row.method as PosMethod)),
    registerName: session.cashRegister?.name ?? null,
    saleCount: session._count.sales,
  }));

  // No template → nobody can open a session. An admin builds one first.
  if (templateOptions.length === 0) {
    return (
      <EmptyPage eyebrow={copy.pos.title} title={copy.pos.noTemplates}>
        {copy.pos.noTemplatesHintUser}
      </EmptyPage>
    );
  }

  const joined = sessions.find((session) => session.id === me?.selectedPosSessionId) ?? null;

  if (!joined) {
    return (
      <SessionPicker locale={locale} sessions={sessionRows} templates={templateOptions} registers={registers} />
    );
  }

  const cells = await prisma.posTemplateCell.findMany({
    where: { templateId: joined.templateId },
    orderBy: { position: "asc" },
    select: { position: true, elementId: true, label: true, price: true },
  });

  const tiles: Tile[] = cells.map((cell) => ({
    position: cell.position,
    elementId: cell.elementId,
    label: cell.label,
    unitPrice: toRappen(cell.price),
  }));

  const templatesLink =
    access.role === "ADMIN" ? (
      <Link
        href="/pos/templates"
        title={copy.pos.templatesTitle}
        aria-label={copy.pos.templatesTitle}
        className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
      >
        <LayoutGrid />
        <span className="hidden lg:inline">{copy.pos.templatesTitle}</span>
      </Link>
    ) : null;

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.pos.title}
        title={joined.name}
        actions={
          <>
            <SessionsModal
              locale={locale}
              sessions={sessionRows}
              templates={templateOptions}
              registers={registers}
              currentSessionId={joined.id}
            />
            {templatesLink}
          </>
        }
      />

      <Till
        locale={locale}
        sessionId={joined.id}
        status={joined.status as "OPEN" | "PAUSED"}
        methods={orderMethods(joined.methods.map((row) => row.method as PosMethod))}
        tiles={tiles}
      />
    </div>
  );
}
